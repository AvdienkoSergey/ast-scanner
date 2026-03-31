import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'
import { FileAnalysis, ImportInfo } from '../types'
import { buildModuleLid } from '../lid'

// --- Path alias resolution ---

export interface PathAlias {
  prefix: string // e.g. "@/", "~/", "#/"
  replacement: string // absolute path, e.g. "/project/src/"
}

export function loadPathAliases(projectRoot: string): PathAlias[] {
  const tsconfigPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json')
  if (!tsconfigPath) return []

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error || !configFile.config) return []

  const basePath = path.dirname(tsconfigPath)
  const compilerOptions = configFile.config.compilerOptions
  if (!compilerOptions?.paths) return []

  const baseUrl = compilerOptions.baseUrl
    ? path.resolve(basePath, compilerOptions.baseUrl)
    : basePath

  const aliases: PathAlias[] = []
  for (const [pattern, targets] of Object.entries(compilerOptions.paths)) {
    if (!pattern.endsWith('/*') || !Array.isArray(targets) || targets.length === 0) continue
    const prefix = pattern.slice(0, -1) // "@/*" → "@/"
    const target = (targets as string[])[0]
    if (!target.endsWith('/*')) continue
    const replacement = path.resolve(baseUrl, target.slice(0, -1)) // "src/*" → "/abs/src/"
    aliases.push({ prefix, replacement })
  }

  return aliases
}

// --- Path resolution ---

function resolveModulePath(
  moduleSpecifier: string,
  importingFile: string,
  aliases: PathAlias[]
): string | null {
  const isRelative = moduleSpecifier.startsWith('.')

  let matchedAlias: PathAlias | undefined
  if (!isRelative) {
    matchedAlias = aliases.find((a) => moduleSpecifier.startsWith(a.prefix))
  }

  if (!isRelative && !matchedAlias) return null

  let basePath: string
  if (matchedAlias) {
    basePath = path.join(matchedAlias.replacement, moduleSpecifier.slice(matchedAlias.prefix.length))
  } else {
    basePath = path.resolve(path.dirname(importingFile), moduleSpecifier)
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath

  const extensions = ['.ts', '.tsx', '.vue', '/index.ts', '/index.tsx']
  for (const ext of extensions) {
    const fullPath = basePath + ext
    if (fs.existsSync(fullPath)) return fullPath
  }

  return null
}

// --- Barrel re-export resolution ---

type BarrelCache = Map<string, Map<string, string>>

function resolveBarrelExport(
  indexFile: string,
  importedName: string,
  barrelCache: BarrelCache,
  aliases: PathAlias[]
): string | null {
  if (!barrelCache.has(indexFile)) {
    barrelCache.set(indexFile, buildBarrelMap(indexFile, aliases))
  }
  return barrelCache.get(indexFile)!.get(importedName) ?? null
}

function buildBarrelMap(indexFile: string, aliases: PathAlias[]): Map<string, string> {
  const result = new Map<string, string>()

  let content: string
  try {
    content = fs.readFileSync(indexFile, 'utf-8')
  } catch {
    return result
  }

  const sf = ts.createSourceFile(indexFile, content, ts.ScriptTarget.Latest, true)

  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier) continue

    const moduleSpec = (stmt.moduleSpecifier as ts.StringLiteral).text
    const resolved = resolveModulePath(moduleSpec, indexFile, aliases)
    if (!resolved) continue

    if (!stmt.exportClause) {
      result.set(`*:${resolved}`, resolved)
      continue
    }

    if (ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        const exportedName = el.name.text
        result.set(exportedName, resolved)
      }
    }
  }

  return result
}

function resolveImportTarget(
  imp: ImportInfo,
  importingFile: string,
  fnIndex: Map<string, Map<string, string>>,
  barrelCache: BarrelCache,
  aliases: PathAlias[]
): { resolvedPath: string; importedName: string } | null {
  const resolved = resolveModulePath(imp.moduleSpecifier, importingFile, aliases)
  if (!resolved) return null

  if (!resolved.endsWith('/index.ts') && !resolved.endsWith('/index.tsx')) {
    if (fnIndex.has(resolved)) {
      return { resolvedPath: resolved, importedName: imp.importedName }
    }
    return null
  }

  const barrelTarget = resolveBarrelExport(resolved, imp.importedName, barrelCache, aliases)
  if (barrelTarget && fnIndex.has(barrelTarget)) {
    return { resolvedPath: barrelTarget, importedName: imp.importedName }
  }

  const barrelMap = barrelCache.get(resolved) ?? buildBarrelMap(resolved, aliases)
  barrelCache.set(resolved, barrelMap)
  for (const [key, targetFile] of barrelMap) {
    if (!key.startsWith('*:')) continue
    if (!fnIndex.has(targetFile)) continue

    const targetFns = fnIndex.get(targetFile)
    if (targetFns?.has(imp.importedName)) {
      return { resolvedPath: targetFile, importedName: imp.importedName }
    }

    const fileBaseName = path.basename(targetFile, path.extname(targetFile))
    const importBaseName = imp.importedName
      .replace(/^use/, '')
      .replace(/Store$/, '')
      .toLowerCase()
    if (
      fileBaseName.toLowerCase() === importBaseName ||
      fileBaseName.toLowerCase().includes(importBaseName)
    ) {
      return { resolvedPath: targetFile, importedName: imp.importedName }
    }
  }

  return null
}

// --- Main resolver ---

export function resolveRefsManual(
  analyses: FileAnalysis[],
  fnIndex: Map<string, Map<string, string>>,
  projectPath: string
): Map<string, Set<string>> {
  const aliases = loadPathAliases(projectPath)
  const barrelCache: BarrelCache = new Map()
  const entityRefs = new Map<string, Set<string>>()

  for (const analysis of analyses) {
    const { absolutePath, imports, calls, bindings } = analysis

    const importMap = new Map<string, { resolvedPath: string; importedName: string }>()
    for (const imp of imports) {
      const target = resolveImportTarget(imp, absolutePath, fnIndex, barrelCache, aliases)
      if (target) importMap.set(imp.localName, target)
    }

    const bindingMap = new Map<string, string>()
    for (const b of bindings) {
      bindingMap.set(b.localName, b.sourceFnName)
    }

    const localFnIndex = fnIndex.get(absolutePath)

    const hasModuleCalls = calls.some((c) => c.callerName === '__module__')
    const moduleLid = hasModuleCalls ? buildModuleLid(absolutePath, projectPath) : null

    for (const call of calls) {
      let callerLid: string | undefined
      if (call.callerName === '__module__') {
        callerLid = moduleLid ?? undefined
      } else {
        callerLid = localFnIndex?.get(call.callerName)
      }
      if (!callerLid) continue

      let targetLid: string | undefined

      // obj.method() calls
      if (call.calleeName.includes('.')) {
        const parts = call.calleeName.split('.')
        const objName = parts[0]
        const methodName = parts[parts.length - 1]

        const directImp = importMap.get(objName)
        if (directImp) {
          const targetFns = fnIndex.get(directImp.resolvedPath)
          targetLid = targetFns?.get(methodName)
        }

        if (!targetLid) {
          const sourceFn = bindingMap.get(objName)
          if (sourceFn) {
            const sourceImp = importMap.get(sourceFn)
            if (sourceImp) {
              const targetFns = fnIndex.get(sourceImp.resolvedPath)
              targetLid = targetFns?.get(methodName)
              if (!targetLid) targetLid = targetFns?.get(sourceImp.importedName)
            }
          }
        }
      }

      // Direct calls: foo()
      if (!targetLid && !call.calleeName.includes('.') && localFnIndex?.has(call.calleeName)) {
        targetLid = localFnIndex.get(call.calleeName)
      }

      // Imported function
      if (!targetLid && !call.calleeName.includes('.')) {
        const imp = importMap.get(call.calleeName)
        if (imp) {
          const targetFns = fnIndex.get(imp.resolvedPath)
          targetLid = targetFns?.get(imp.importedName)
        }
      }

      // Destructured from a call
      if (!targetLid && !call.calleeName.includes('.')) {
        const sourceFn = bindingMap.get(call.calleeName)
        if (sourceFn) {
          const sourceImp = importMap.get(sourceFn)
          if (sourceImp) {
            const targetFns = fnIndex.get(sourceImp.resolvedPath)
            targetLid = targetFns?.get(call.calleeName)
            if (!targetLid) targetLid = targetFns?.get(sourceImp.importedName)
          }
        }
      }

      if (targetLid && targetLid !== callerLid) {
        if (!entityRefs.has(callerLid)) entityRefs.set(callerLid, new Set())
        entityRefs.get(callerLid)!.add(targetLid)
      }
    }
  }

  return entityRefs
}

// Re-export helpers needed by scanner.ts for component resolution
export { resolveModulePath }
