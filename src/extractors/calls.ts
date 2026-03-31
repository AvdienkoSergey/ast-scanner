import * as ts from 'typescript'
import { RawCall, CallBinding } from '../types'

export interface CallAnalysis {
  calls: RawCall[]
  bindings: CallBinding[]
}

/**
 * Walk AST and collect:
 * 1. Function calls (direct and member access)
 * 2. Variable bindings from call expressions (destructured and assigned)
 */
export function extractCalls(sourceFile: ts.SourceFile): CallAnalysis {
  const calls: RawCall[] = []
  const bindings: CallBinding[] = []
  const seenCalls = new Set<string>()
  const seenBindings = new Set<string>()

  function addCall(callerName: string, calleeName: string) {
    const key = `${callerName}->${calleeName}`
    if (seenCalls.has(key)) return
    seenCalls.add(key)
    calls.push({ callerName, calleeName })
  }

  function addBinding(localName: string, sourceFnName: string) {
    if (seenBindings.has(localName)) return
    seenBindings.add(localName)
    bindings.push({ localName, sourceFnName })
  }

  function visit(node: ts.Node, enclosingFn: string | null) {
    let currentFn = enclosingFn

    if (ts.isFunctionDeclaration(node) && node.name) {
      currentFn = node.name.text
    }

    // const foo = () => {} / const foo = function() {}
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      currentFn = node.name.text
    }

    // Object methods: { methodName() {} } or { methodName: () => {} }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      currentFn = node.name.text
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      currentFn = node.name.text
    }

    // --- Collect bindings from call expressions ---
    // const { a, b } = foo()
    // const x = foo()
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const callExpr = node.initializer
      if (ts.isIdentifier(callExpr.expression)) {
        const sourceFn = callExpr.expression.text

        if (ts.isObjectBindingPattern(node.name)) {
          for (const el of node.name.elements) {
            if (ts.isIdentifier(el.name)) {
              addBinding(el.name.text, sourceFn)
            }
          }
        }

        if (ts.isIdentifier(node.name)) {
          addBinding(node.name.text, sourceFn)
        }
      }
    }

    // --- Collect calls ---
    if (ts.isCallExpression(node)) {
      const caller = currentFn ?? '__module__'

      // Direct: foo()
      if (ts.isIdentifier(node.expression)) {
        addCall(caller, node.expression.text)
      }

      // Member: obj.method()
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression)
      ) {
        const objName = node.expression.expression.text
        const methodName = node.expression.name.text
        addCall(caller, `${objName}.${methodName}`)
      }
    }

    ts.forEachChild(node, (child) => visit(child, currentFn))
  }

  visit(sourceFile, null)
  return { calls, bindings }
}
