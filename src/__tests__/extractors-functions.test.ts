import { describe, it, expect } from 'vitest'
import { extractFunctions } from '../extractors/functions'
import { parseTypeScriptFile } from '../parsers/typescript'

function parse(code: string) {
  return parseTypeScriptFile('test.ts', code)
}

describe('extractFunctions', () => {
  it('extracts exported function declaration', () => {
    const sf = parse('export function greet(name: string): string { return name }')
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('greet')
    expect(fns[0].isExported).toBe(true)
    expect(fns[0].isAsync).toBe(false)
    expect(fns[0].returnType).toBe('string')
    expect(fns[0].params).toEqual([{ name: 'name', type: 'string', optional: false }])
    expect(fns[0].signature).toBe('greet(name: string): string')
  })

  it('extracts non-exported function declaration', () => {
    const sf = parse('function helper(): void {}')
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('helper')
    expect(fns[0].isExported).toBe(false)
  })

  it('extracts async function', () => {
    const sf = parse('export async function fetchData(): Promise<void> {}')
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].isAsync).toBe(true)
    expect(fns[0].returnType).toBe('Promise<void>')
    expect(fns[0].signature).toBe('async fetchData(): Promise<void>')
  })

  it('extracts exported arrow function', () => {
    const sf = parse('export const add = (a: number, b: number): number => a + b')
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('add')
    expect(fns[0].isExported).toBe(true)
    expect(fns[0].params).toHaveLength(2)
    expect(fns[0].params[0]).toEqual({ name: 'a', type: 'number', optional: false })
    expect(fns[0].params[1]).toEqual({ name: 'b', type: 'number', optional: false })
  })

  it('extracts exported function expression', () => {
    const sf = parse('export const run = function(x: string): void {}')
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('run')
    expect(fns[0].isExported).toBe(true)
  })

  it('extracts async arrow function', () => {
    const sf = parse('export const load = async (): Promise<string> => ""')
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].isAsync).toBe(true)
    expect(fns[0].returnType).toBe('Promise<string>')
  })

  it('handles optional parameters', () => {
    const sf = parse('export function foo(a: string, b?: number): void {}')
    const fns = extractFunctions(sf)
    expect(fns[0].params).toEqual([
      { name: 'a', type: 'string', optional: false },
      { name: 'b', type: 'number', optional: true }
    ])
  })

  it('handles parameters with default values', () => {
    const sf = parse('export function foo(x: number = 5): void {}')
    const fns = extractFunctions(sf)
    expect(fns[0].params[0].optional).toBe(true)
  })

  it('uses unknown for arrow functions without explicit return type', () => {
    const sf = parse('export const fn = () => 42')
    const fns = extractFunctions(sf)
    expect(fns[0].returnType).toBe('unknown')
  })

  it('uses void for function declarations without return type', () => {
    const sf = parse('export function foo() {}')
    const fns = extractFunctions(sf)
    expect(fns[0].returnType).toBe('void')
  })

  it('extracts JSDoc comments', () => {
    const sf = parse(`
/** Greets the user */
export function greet(): void {}
`)
    const fns = extractFunctions(sf)
    expect(fns[0].jsdoc).toBe('Greets the user')
  })

  it('returns undefined jsdoc when no JSDoc present', () => {
    const sf = parse('export function foo(): void {}')
    const fns = extractFunctions(sf)
    expect(fns[0].jsdoc).toBeUndefined()
  })

  it('extracts multiple functions', () => {
    const sf = parse(`
export function a(): void {}
export const b = (): void => {}
function c(): void {}
`)
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(3)
    expect(fns.map((f) => f.name)).toEqual(['a', 'b', 'c'])
  })

  it('extracts Pinia store actions (method shorthand)', () => {
    const sf = parse(`
export const useAuthStore = defineStore('auth', {
  actions: {
    async login(email: string): Promise<void> {},
    logout(): void {}
  }
})
`)
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(2)
    expect(fns[0].name).toBe('login')
    expect(fns[0].isAsync).toBe(true)
    expect(fns[0].isExported).toBe(true)
    expect(fns[1].name).toBe('logout')
  })

  it('extracts Pinia store actions (arrow function property)', () => {
    const sf = parse(`
export const useStore = defineStore('store', {
  actions: {
    fetchData: async (id: number): Promise<void> => {}
  }
})
`)
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('fetchData')
    expect(fns[0].isAsync).toBe(true)
  })

  it('returns empty for file with no functions', () => {
    const sf = parse('const x = 5; export type Foo = string;')
    const fns = extractFunctions(sf)
    expect(fns).toHaveLength(0)
  })

  it('sets correct line numbers', () => {
    const sf = parse(`const x = 1
export function foo(): void {}
`)
    const fns = extractFunctions(sf)
    expect(fns[0].line).toBe(2)
  })
})
