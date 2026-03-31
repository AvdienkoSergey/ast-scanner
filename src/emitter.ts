import { execFileSync } from 'child_process'
import * as path from 'path'
import { EmitEntity, FunctionInfo } from './types'

function emitToCtx(
  entities: EmitEntity[],
  dbPath: string,
  ctxBin = 'ctx',
  quiet = false
): void {
  if (entities.length === 0) return

  const payload = { entities }
  const json = JSON.stringify(payload)

  try {
    execFileSync(ctxBin, ['--db', dbPath, 'call', 'emit', json], {
      encoding: 'utf-8',
      stdio: quiet ? 'pipe' : 'inherit'
    })
  } catch (error) {
    if (!quiet) {
      console.error('Failed to emit to ctx:', error)
    }
    throw error
  }
}

export function functionToEntity(
  fn: FunctionInfo,
  filePath: string,
  projectRoot: string
): EmitEntity {
  // Convert path to LID path
  // src/composables/useAuth.ts → composables/useAuth
  const relativePath = path.relative(projectRoot, filePath)
  const lidPath = relativePath.replace(/^src\//, '').replace(/\.(ts|tsx|vue)$/, '')

  const lid = `fn:${lidPath}/${fn.name}`

  const data: Record<string, unknown> = {
    file: relativePath,
    line: fn.line,
    signature: fn.signature,
    returnType: fn.returnType,
    isAsync: fn.isAsync,
    isExported: fn.isExported
  }

  if (fn.params.length > 0) {
    data.params = fn.params.map((p) => p.name)
    data.paramTypes = fn.params.map((p) => p.type)
  }

  if (fn.jsdoc) {
    data.jsdoc = fn.jsdoc
  }

  return { lid, data, refs: [] }
}

export function batchEmit(
  entities: EmitEntity[],
  dbPath: string,
  ctxBin = 'ctx',
  batchSize = 50,
  quiet = false
): void {
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize)
    emitToCtx(batch, dbPath, ctxBin, quiet)

    if (!quiet) {
      const emitted = Math.min(i + batchSize, entities.length)
      console.log(`Emitted ${emitted}/${entities.length} entities`)
    }
  }
}
