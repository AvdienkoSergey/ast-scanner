import { glob } from 'glob'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  ScanOptions,
  FunctionInfo,
  ImportInfo,
  RawCall,
  CallBinding,
  EmitEntity,
  FileAnalysis
} from './types'
import { parseTypeScriptFile } from './parsers/typescript'
import { parseVueFileFull } from './parsers/vue'
import { extractFunctions } from './extractors/functions'
import { extractImports } from './extractors/imports'
import { extractCalls } from './extractors/calls'
import {
  extractTemplateComponents,
  extractDefineProps,
  extractDefineEmits,
  type VuePropInfo
} from './extractors/components'
import { functionToEntity, batchEmit } from './emitter'
import { resolveRefsManual, resolveModulePath, loadPathAliases } from './resolvers/manual'
import { resolveRefsPrecise } from './resolvers/precise'
import { buildLid, buildModuleLid } from './lid'

// --- Core analysis ---

async function analyzeProject(options: ScanOptions): Promise<{
  filesScanned: number
  entities: EmitEntity[]
}> {
  const {
    projectPath,
    include = ['**/*.{ts,tsx,vue}'],
    exclude = ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    exportedOnly = true,
    precise = false,
    quiet = false
  } = options

  const files = await glob(include, {
    cwd: projectPath,
    ignore: exclude,
    absolute: true
  })

  // --- Pass 1: extract everything from each file ---

  const analyses: FileAnalysis[] = []
  const fnIndex = new Map<string, Map<string, string>>()

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8')
    const relativePath = path.relative(projectPath, file)

    let functions: FunctionInfo[] = []
    let imports: ImportInfo[] = []
    let calls: RawCall[] = []
    let bindings: CallBinding[] = []
    let componentName: string | null = null
    let childComponents: string[] = []
    let props: VuePropInfo[] = []
    let emits: string[] = []
    let vueScriptContent: string | null = null

    try {
      if (file.endsWith('.vue')) {
        const vueInfo = parseVueFileFull(content, file)
        componentName = vueInfo.componentName

        if (vueInfo.script) {
          const vueScript = vueInfo.script
          vueScriptContent = vueScript.content
          const sourceFile = parseTypeScriptFile(
            file.replace('.vue', '.ts'),
            vueScript.content
          )
          functions = extractFunctions(sourceFile).map((fn) => ({
            ...fn,
            line: fn.line + vueScript.startLine - 1
          }))
          imports = extractImports(sourceFile)
          const callAnalysis = extractCalls(sourceFile)
          calls = callAnalysis.calls
          bindings = callAnalysis.bindings
          props = extractDefineProps(sourceFile)
          emits = extractDefineEmits(sourceFile)
        }

        if (vueInfo.templateContent) {
          childComponents = extractTemplateComponents(vueInfo.templateContent)
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        const sourceFile = parseTypeScriptFile(file, content)
        functions = extractFunctions(sourceFile)
        imports = extractImports(sourceFile)
        const callAnalysis = extractCalls(sourceFile)
        calls = callAnalysis.calls
        bindings = callAnalysis.bindings
      }
    } catch (err) {
      if (!quiet) {
        console.warn(`Warning: failed to parse ${relativePath}: ${err instanceof Error ? err.message : err}`)
      }
      continue
    }

    // fnIndex includes ALL functions (for ref resolution),
    // but entities only include exported ones (unless --all)
    const fileFnMap = new Map<string, string>()
    for (const fn of functions) {
      fileFnMap.set(fn.name, buildLid(fn.name, file, projectPath))
    }
    fnIndex.set(file, fileFnMap)

    const entityFns = exportedOnly ? functions.filter((fn) => fn.isExported) : functions

    analyses.push({
      absolutePath: file,
      relativePath,
      functions: entityFns,
      imports,
      calls,
      bindings,
      componentName,
      childComponents,
      props,
      emits,
      vueScriptContent
    })
  }

  // --- Pass 2: resolve calls → refs ---

  const entityRefs = precise
    ? resolveRefsPrecise(analyses, fnIndex, projectPath)
    : resolveRefsManual(analyses, fnIndex, projectPath)

  // --- Pass 3: resolve Vue component → component refs ---

  const aliases = loadPathAliases(projectPath)
  const componentFileMap = new Map<string, string>()
  for (const analysis of analyses) {
    for (const imp of analysis.imports) {
      if (imp.moduleSpecifier.endsWith('.vue')) {
        const resolved = resolveModulePath(imp.moduleSpecifier, analysis.absolutePath, aliases)
        if (resolved) componentFileMap.set(imp.localName, resolved)
      }
    }
  }

  // --- Build final entities with refs ---

  const entities: EmitEntity[] = []
  for (const analysis of analyses) {
    // fn: entities
    for (const fn of analysis.functions) {
      const entity = functionToEntity(fn, analysis.absolutePath, projectPath)
      const refs = entityRefs.get(entity.lid)
      if (refs) {
        entity.refs = Array.from(refs).map((target) => ({ target, rel: 'calls' }))
      }
      entities.push(entity)
    }

    // __setup__ entity for top-level calls
    const moduleLid = buildModuleLid(analysis.absolutePath, projectPath)
    const moduleRefs = entityRefs.get(moduleLid)
    if (moduleRefs && moduleRefs.size > 0) {
      entities.push({
        lid: moduleLid,
        data: {
          file: analysis.relativePath,
          line: 1,
          signature: `__setup__(${path.basename(analysis.relativePath)})`,
          returnType: 'void',
          isAsync: false,
          isExported: false
        },
        refs: Array.from(moduleRefs).map((target) => ({ target, rel: 'calls' }))
      })
    }

    // comp: entity for Vue files
    if (analysis.componentName) {
      const compLid = `comp:${analysis.relativePath.replace(/^src\//, '').replace(/\.vue$/, '')}`

      const compRefs: { target: string; rel: string }[] = []

      for (const childName of analysis.childComponents) {
        const childFile = componentFileMap.get(childName)
        if (childFile) {
          const childRel = path.relative(projectPath, childFile)
          const childLid = `comp:${childRel.replace(/^src\//, '').replace(/\.vue$/, '')}`
          compRefs.push({ target: childLid, rel: 'renders' })
        }
      }

      if (moduleRefs && moduleRefs.size > 0) {
        compRefs.push({ target: moduleLid, rel: 'contains' })
      }

      const compData: Record<string, unknown> = {
        file: analysis.relativePath,
        line: 1,
        name: analysis.componentName
      }
      if (analysis.props.length > 0) {
        compData.props = analysis.props.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}`)
      }
      if (analysis.emits.length > 0) {
        compData.emits = analysis.emits
      }
      if (analysis.childComponents.length > 0) {
        compData.children = analysis.childComponents
      }

      entities.push({ lid: compLid, data: compData, refs: compRefs.length > 0 ? compRefs : [] })
    }
  }

  return { filesScanned: files.length, entities }
}

export async function scanProject(options: ScanOptions): Promise<void> {
  const { dbPath, ctxBin = 'ctx', quiet = false } = options

  if (!quiet) console.log('Scanning...')

  const { filesScanned, entities } = await analyzeProject(options)

  if (!quiet) {
    const refsCount = entities.reduce((sum, e) => sum + (e.refs?.length ?? 0), 0)
    console.log(`Scanned ${filesScanned} files, ${entities.length} functions, ${refsCount} refs`)
  }

  if (entities.length > 0) {
    batchEmit(entities, dbPath, ctxBin, 50, quiet)
  }

  if (!quiet) console.log('Done!')
}

export async function scanAndReport(options: ScanOptions): Promise<{
  filesScanned: number
  functionsFound: number
  refsFound: number
  entities: EmitEntity[]
}> {
  const { filesScanned, entities } = await analyzeProject(options)
  const refsFound = entities.reduce((sum, e) => sum + (e.refs?.length ?? 0), 0)

  return { filesScanned, functionsFound: entities.length, refsFound, entities }
}
