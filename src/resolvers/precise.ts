import * as path from 'path'
import * as ts from 'typescript'
import { FileAnalysis } from '../types'
import { buildModuleLid } from '../lid'

// --- TypeScript Program creation ---

function findTsConfig(projectPath: string): string | undefined {
  return ts.findConfigFile(projectPath, ts.sys.fileExists, 'tsconfig.json')
}

function createProgramFromConfig(
  tsconfigPath: string,
  vueScriptMap: Map<string, string>
): ts.Program {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const basePath = path.dirname(tsconfigPath)
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, basePath)

  const host = ts.createCompilerHost(parsed.options)
  const originalReadFile = host.readFile.bind(host)
  const originalFileExists = host.fileExists.bind(host)

  // Intercept .vue files: return extracted script content as TypeScript
  host.readFile = (fileName: string) => {
    if (fileName.endsWith('.vue.ts')) {
      const vuePath = fileName.slice(0, -3) // remove trailing .ts
      return vueScriptMap.get(vuePath) ?? ''
    }
    return originalReadFile(fileName)
  }

  host.fileExists = (fileName: string) => {
    if (fileName.endsWith('.vue.ts')) {
      const vuePath = fileName.slice(0, -3)
      return vueScriptMap.has(vuePath)
    }
    return originalFileExists(fileName)
  }

  // Add virtual .vue.ts files to the file list
  const fileNames = [...parsed.fileNames, ...Array.from(vueScriptMap.keys()).map((p) => p + '.ts')]

  return ts.createProgram(fileNames, parsed.options, host)
}

function createProgramDefault(
  files: string[],
  projectPath: string,
  vueScriptMap: Map<string, string>
): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    esModuleInterop: true,
    baseUrl: projectPath,
    paths: { '@/*': ['src/*'] },
    allowJs: true,
    skipLibCheck: true
  }

  const host = ts.createCompilerHost(options)
  const originalReadFile = host.readFile.bind(host)
  const originalFileExists = host.fileExists.bind(host)

  host.readFile = (fileName: string) => {
    if (fileName.endsWith('.vue.ts')) {
      const vuePath = fileName.slice(0, -3)
      return vueScriptMap.get(vuePath) ?? ''
    }
    return originalReadFile(fileName)
  }

  host.fileExists = (fileName: string) => {
    if (fileName.endsWith('.vue.ts')) {
      const vuePath = fileName.slice(0, -3)
      return vueScriptMap.has(vuePath)
    }
    return originalFileExists(fileName)
  }

  const fileNames = [
    ...files.filter((f) => !f.endsWith('.vue')),
    ...Array.from(vueScriptMap.keys()).map((p) => p + '.ts')
  ]

  return ts.createProgram(fileNames, options, host)
}

// --- Symbol resolution ---

function getDeclarationFile(symbol: ts.Symbol, checker: ts.TypeChecker): ts.SourceFile | undefined {
  // Follow aliases (re-exports)
  let resolved = symbol
  if (resolved.flags & ts.SymbolFlags.Alias) {
    try {
      resolved = checker.getAliasedSymbol(resolved)
    } catch {
      // getAliasedSymbol can throw for certain edge cases
    }
  }

  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0]
  return decl?.getSourceFile()
}

function getDeclarationName(symbol: ts.Symbol, checker: ts.TypeChecker): string | undefined {
  let resolved = symbol
  if (resolved.flags & ts.SymbolFlags.Alias) {
    try {
      resolved = checker.getAliasedSymbol(resolved)
    } catch {
      return symbol.name
    }
  }
  return resolved.name
}

function mapVirtualPathToReal(fileName: string): string {
  // .vue.ts virtual files map back to .vue
  if (fileName.endsWith('.vue.ts')) {
    return fileName.slice(0, -3)
  }
  return fileName
}

// --- AST walk for calls ---

function walkCalls(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  fnIndex: Map<string, Map<string, string>>,
  projectRoot: string,
  realFilePath: string
): Map<string, Set<string>> {
  const refs = new Map<string, Set<string>>()
  const localFnIndex = fnIndex.get(realFilePath)

  function addRef(callerLid: string, targetLid: string) {
    if (callerLid === targetLid) return
    let callerRefs = refs.get(callerLid)
    if (!callerRefs) { callerRefs = new Set(); refs.set(callerLid, callerRefs) }
    callerRefs.add(targetLid)
  }

  function getEnclosingFunction(node: ts.Node): string | null {
    let current = node.parent
    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text
      }
      if (
        ts.isVariableDeclaration(current) &&
        ts.isIdentifier(current.name) &&
        current.initializer &&
        (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
      ) {
        return current.name.text
      }
      if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
        return current.name.text
      }
      if (
        ts.isPropertyAssignment(current) &&
        ts.isIdentifier(current.name) &&
        current.initializer &&
        (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))
      ) {
        return current.name.text
      }
      current = current.parent
    }
    return null
  }

  function resolveCallTarget(node: ts.CallExpression): string | undefined {
    // Direct call: foo()
    if (ts.isIdentifier(node.expression)) {
      const symbol = checker.getSymbolAtLocation(node.expression)
      if (!symbol) return undefined

      const declFile = getDeclarationFile(symbol, checker)
      if (!declFile) return undefined

      const declRealPath = mapVirtualPathToReal(declFile.fileName)
      const declName = getDeclarationName(symbol, checker) ?? symbol.name
      const targetFns = fnIndex.get(declRealPath)
      return targetFns?.get(declName)
    }

    // Member access: obj.method()
    if (ts.isPropertyAccessExpression(node.expression)) {
      const methodSymbol = checker.getSymbolAtLocation(node.expression.name)
      if (!methodSymbol) return undefined

      const declFile = getDeclarationFile(methodSymbol, checker)
      if (!declFile) return undefined

      const declRealPath = mapVirtualPathToReal(declFile.fileName)
      const declName = getDeclarationName(methodSymbol, checker) ?? methodSymbol.name
      const targetFns = fnIndex.get(declRealPath)
      return targetFns?.get(declName)
    }

    return undefined
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const enclosing = getEnclosingFunction(node)
      let callerLid: string | undefined

      if (enclosing) {
        callerLid = localFnIndex?.get(enclosing)
      } else {
        callerLid = buildModuleLid(realFilePath, projectRoot)
      }

      if (callerLid) {
        const targetLid = resolveCallTarget(node)
        if (targetLid) {
          addRef(callerLid, targetLid)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return refs
}

// --- Main resolver ---

export function resolveRefsPrecise(
  analyses: FileAnalysis[],
  fnIndex: Map<string, Map<string, string>>,
  projectPath: string
): Map<string, Set<string>> {
  // Build vue script map from already-parsed content
  const vueScriptMap = new Map<string, string>()
  for (const analysis of analyses) {
    if (analysis.absolutePath.endsWith('.vue') && analysis.vueScriptContent) {
      vueScriptMap.set(analysis.absolutePath, analysis.vueScriptContent)
    }
  }

  // Create ts.Program
  const tsConfigPath = findTsConfig(projectPath)
  const tsFiles = analyses.map((a) => a.absolutePath).filter((f) => !f.endsWith('.vue'))

  const program = tsConfigPath
    ? createProgramFromConfig(tsConfigPath, vueScriptMap)
    : createProgramDefault(tsFiles, projectPath, vueScriptMap)

  const checker = program.getTypeChecker()

  // Resolve refs using TypeChecker
  const entityRefs = new Map<string, Set<string>>()

  for (const analysis of analyses) {
    let sourceFile: ts.SourceFile | undefined

    if (analysis.absolutePath.endsWith('.vue')) {
      // Get the virtual .vue.ts source file
      sourceFile = program.getSourceFile(analysis.absolutePath + '.ts')
    } else {
      sourceFile = program.getSourceFile(analysis.absolutePath)
    }

    if (!sourceFile) continue

    const fileRefs = walkCalls(sourceFile, checker, fnIndex, projectPath, analysis.absolutePath)

    for (const [caller, targets] of fileRefs) {
      let callerRefs = entityRefs.get(caller)
      if (!callerRefs) { callerRefs = new Set(); entityRefs.set(caller, callerRefs) }
      for (const target of targets) {
        callerRefs.add(target)
      }
    }
  }

  return entityRefs
}
