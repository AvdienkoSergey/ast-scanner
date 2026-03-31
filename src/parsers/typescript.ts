import * as ts from 'typescript'

export function parseTypeScriptFile(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true // setParentNodes - needed for upward navigation
  )
}

export function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.getModifiers(node as ts.HasModifiers)
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

export function hasAsyncModifier(node: ts.Node): boolean {
  const modifiers = ts.getModifiers(node as ts.HasModifiers)
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false
}

export function getNodeText(node: ts.Node | undefined, sourceFile: ts.SourceFile): string {
  if (!node) return ''
  return node.getText(sourceFile)
}
