import path from 'node:path'

export function buildLid(fnName: string, filePath: string, projectRoot: string): string {
  const relativePath = path.relative(projectRoot, filePath)
  const lidPath = relativePath.replace(/^src\//, '').replace(/\.(ts|tsx|vue)$/, '')
  return `fn:${lidPath}/${fnName}`
}

export function buildModuleLid(filePath: string, projectRoot: string): string {
  const relativePath = path.relative(projectRoot, filePath)
  const lidPath = relativePath.replace(/^src\//, '').replace(/\.(ts|tsx|vue)$/, '')
  return `fn:${lidPath}/__setup__`
}
