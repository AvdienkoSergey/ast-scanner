import * as ts from 'typescript'
import { FunctionInfo, ParamInfo } from '../types'
import { hasExportModifier, hasAsyncModifier, getNodeText } from '../parsers/typescript'

export function extractFunctions(sourceFile: ts.SourceFile): FunctionInfo[] {
  const functions: FunctionInfo[] = []

  function visit(node: ts.Node) {
    // 1. Function declarations: function foo() {}
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.push(extractFunctionDeclaration(node, sourceFile))
    }

    // 2. Pinia store actions: defineStore('name', { actions: { method() {} } })
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isVariableDeclaration(decl) || !decl.initializer) continue
        if (!ts.isCallExpression(decl.initializer)) continue

        const callee = decl.initializer.expression
        if (!ts.isIdentifier(callee) || callee.text !== 'defineStore') continue

        const storeActions = findStoreActions(decl.initializer, sourceFile)
        for (const fn of storeActions) {
          fn.isExported = hasExportModifier(node)
          functions.push(fn)
        }
      }
    }

    // 3. Arrow functions and function expressions: const foo = () => {}
    if (ts.isVariableStatement(node)) {
      const isExported = hasExportModifier(node)

      for (const decl of node.declarationList.declarations) {
        if (!ts.isVariableDeclaration(decl) || !decl.initializer) continue
        if (!ts.isIdentifier(decl.name)) continue

        if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
          functions.push(extractArrowFunction(decl, decl.initializer, sourceFile, isExported))
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return functions
}

function extractFunctionDeclaration(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile
): FunctionInfo {
  const name = node.name?.text ?? 'anonymous'
  const params = extractParams(node.parameters, sourceFile)
  const returnType = normalizeWhitespace(getNodeText(node.type, sourceFile) || 'void')
  const isAsync = hasAsyncModifier(node)
  const isExported = hasExportModifier(node)
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())

  return {
    name,
    signature: buildSignature(name, params, returnType, isAsync),
    params,
    returnType,
    isAsync,
    isExported,
    line: line + 1,
    jsdoc: extractJSDoc(node)
  }
}

function extractArrowFunction(
  decl: ts.VariableDeclaration,
  fn: ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  isExported: boolean
): FunctionInfo {
  const name = (decl.name as ts.Identifier).text
  const params = extractParams(fn.parameters, sourceFile)
  const returnType = normalizeWhitespace(getNodeText(fn.type, sourceFile) || inferReturnType(fn))
  const isAsync = hasAsyncModifier(fn)
  const { line } = sourceFile.getLineAndCharacterOfPosition(decl.getStart())

  return {
    name,
    signature: buildSignature(name, params, returnType, isAsync),
    params,
    returnType,
    isAsync,
    isExported,
    line: line + 1,
    jsdoc: extractJSDoc(decl.parent.parent) // VariableStatement
  }
}

function extractParams(
  params: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile
): ParamInfo[] {
  return params.map((p) => ({
    name: getNodeText(p.name, sourceFile),
    type: normalizeWhitespace(getNodeText(p.type, sourceFile) || 'any'),
    optional: !!p.questionToken || !!p.initializer
  }))
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim()
}

function buildSignature(
  name: string,
  params: ParamInfo[],
  returnType: string,
  isAsync: boolean
): string {
  const paramsStr = params
    .map((p) => `${p.name}${p.optional ? '?' : ''}: ${normalizeWhitespace(p.type)}`)
    .join(', ')

  const prefix = isAsync ? 'async ' : ''
  return `${prefix}${name}(${paramsStr}): ${normalizeWhitespace(returnType)}`
}

function inferReturnType(_fn: ts.ArrowFunction | ts.FunctionExpression): string {
  // Simple heuristic: if body is expression (not block), we can't easily infer
  // For now just return 'unknown'
  return 'unknown'
}

/**
 * Extract methods from defineStore({ actions: { ... } }).
 * Handles both method shorthand and arrow/function expression properties.
 */
function findStoreActions(callExpr: ts.CallExpression, sourceFile: ts.SourceFile): FunctionInfo[] {
  const results: FunctionInfo[] = []

  // defineStore('name', { actions: { ... } })
  // The options object is typically the 2nd argument
  const optionsArg = callExpr.arguments[1]
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return results

  // Find the `actions` property
  const actionsProp = optionsArg.properties.find(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'actions'
  ) as ts.PropertyAssignment | undefined

  if (!actionsProp || !ts.isObjectLiteralExpression(actionsProp.initializer)) return results

  for (const prop of actionsProp.initializer.properties) {
    // Method shorthand: async fetchData() { ... }
    if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) {
      const name = prop.name.text
      const params = extractParams(prop.parameters, sourceFile)
      const returnType = normalizeWhitespace(getNodeText(prop.type, sourceFile) || 'void')
      const isAsync = hasAsyncModifier(prop)
      const { line } = sourceFile.getLineAndCharacterOfPosition(prop.getStart())

      results.push({
        name,
        signature: buildSignature(name, params, returnType, isAsync),
        params,
        returnType,
        isAsync,
        isExported: false,
        line: line + 1,
        jsdoc: extractJSDoc(prop)
      })
    }

    // Property assignment: fetchData: async () => { ... }
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer))
    ) {
      const name = prop.name.text
      const fn = prop.initializer
      const params = extractParams(fn.parameters, sourceFile)
      const returnType = normalizeWhitespace(getNodeText(fn.type, sourceFile) || 'void')
      const isAsync = hasAsyncModifier(fn)
      const { line } = sourceFile.getLineAndCharacterOfPosition(prop.getStart())

      results.push({
        name,
        signature: buildSignature(name, params, returnType, isAsync),
        params,
        returnType,
        isAsync,
        isExported: false,
        line: line + 1,
        jsdoc: extractJSDoc(prop)
      })
    }
  }

  return results
}

function extractJSDoc(node: ts.Node): string | undefined {
  // JSDoc is attached to nodes but not fully public API
  const jsDoc = (node as unknown as { jsDoc?: ts.JSDoc[] }).jsDoc
  if (!jsDoc || jsDoc.length === 0) return undefined

  const comment = jsDoc[0].comment
  if (!comment) return undefined

  if (typeof comment === 'string') return comment

  // NodeArray<JSDocComment>
  return (comment as ts.NodeArray<ts.JSDocComment>).map((c) => c.getText()).join(' ')
}
