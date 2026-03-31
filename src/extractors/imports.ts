import * as ts from 'typescript'
import { ImportInfo } from '../types'

export function extractImports(sourceFile: ts.SourceFile): ImportInfo[] {
  const imports: ImportInfo[] = []

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue

    const moduleSpecifier = (stmt.moduleSpecifier as ts.StringLiteral).text

    // Named imports: import { foo, bar as baz } from './module'
    const bindings = stmt.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.push({
          localName: element.name.text,
          importedName: element.propertyName?.text ?? element.name.text,
          moduleSpecifier
        })
      }
    }

    // Default import: import foo from './module'
    if (stmt.importClause?.name) {
      imports.push({
        localName: stmt.importClause.name.text,
        importedName: 'default',
        moduleSpecifier
      })
    }
  }

  return imports
}
