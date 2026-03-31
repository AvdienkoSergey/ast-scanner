import { describe, it, expect } from 'vitest'
import { functionToEntity } from '../emitter'
import type { FunctionInfo } from '../types'

function makeFn(overrides: Partial<FunctionInfo> = {}): FunctionInfo {
  return {
    name: 'greet',
    signature: 'greet(name: string): string',
    params: [{ name: 'name', type: 'string', optional: false }],
    returnType: 'string',
    isAsync: false,
    isExported: true,
    line: 10,
    ...overrides
  }
}

describe('functionToEntity', () => {
  it('builds correct LID stripping src/ prefix', () => {
    const entity = functionToEntity(makeFn(), '/project/src/utils/format.ts', '/project')
    expect(entity.lid).toBe('fn:utils/format/greet')
  })

  it('strips .tsx extension', () => {
    const entity = functionToEntity(makeFn({ name: 'App' }), '/project/src/App.tsx', '/project')
    expect(entity.lid).toBe('fn:App/App')
  })

  it('strips .vue extension', () => {
    const entity = functionToEntity(
      makeFn({ name: 'onClick' }),
      '/project/src/components/Modal.vue',
      '/project'
    )
    expect(entity.lid).toBe('fn:components/Modal/onClick')
  })

  it('includes file, line, signature, returnType, isAsync, isExported in data', () => {
    const entity = functionToEntity(makeFn(), '/project/src/utils/format.ts', '/project')
    expect(entity.data.file).toBe('src/utils/format.ts')
    expect(entity.data.line).toBe(10)
    expect(entity.data.signature).toBe('greet(name: string): string')
    expect(entity.data.returnType).toBe('string')
    expect(entity.data.isAsync).toBe(false)
    expect(entity.data.isExported).toBe(true)
  })

  it('includes params and paramTypes when params exist', () => {
    const entity = functionToEntity(
      makeFn({
        params: [
          { name: 'a', type: 'string', optional: false },
          { name: 'b', type: 'number', optional: true }
        ]
      }),
      '/project/src/fn.ts',
      '/project'
    )
    expect(entity.data.params).toEqual(['a', 'b'])
    expect(entity.data.paramTypes).toEqual(['string', 'number'])
  })

  it('omits params and paramTypes when no params', () => {
    const entity = functionToEntity(makeFn({ params: [] }), '/project/src/fn.ts', '/project')
    expect(entity.data.params).toBeUndefined()
    expect(entity.data.paramTypes).toBeUndefined()
  })

  it('includes jsdoc when present', () => {
    const entity = functionToEntity(
      makeFn({ jsdoc: 'Greets the user' }),
      '/project/src/fn.ts',
      '/project'
    )
    expect(entity.data.jsdoc).toBe('Greets the user')
  })

  it('omits jsdoc when not present', () => {
    const entity = functionToEntity(makeFn({ jsdoc: undefined }), '/project/src/fn.ts', '/project')
    expect(entity.data.jsdoc).toBeUndefined()
  })

  it('always returns empty refs array', () => {
    const entity = functionToEntity(makeFn(), '/project/src/fn.ts', '/project')
    expect(entity.refs).toEqual([])
  })

  it('handles files not under src/', () => {
    const entity = functionToEntity(makeFn({ name: 'init' }), '/project/lib/init.ts', '/project')
    expect(entity.lid).toBe('fn:lib/init/init')
  })
})
