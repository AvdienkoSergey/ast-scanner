import { describe, it, expect } from 'vitest'
import { extractCalls } from '../extractors/calls'
import { parseTypeScriptFile } from '../parsers/typescript'

function parse(code: string) {
  return parseTypeScriptFile('test.ts', code)
}

describe('extractCalls', () => {
  it('extracts direct function calls at module level', () => {
    const sf = parse('foo()')
    const { calls } = extractCalls(sf)
    expect(calls).toContainEqual({ callerName: '__module__', calleeName: 'foo' })
  })

  it('extracts calls inside a function', () => {
    const sf = parse('function outer() { inner() }')
    const { calls } = extractCalls(sf)
    expect(calls).toContainEqual({ callerName: 'outer', calleeName: 'inner' })
  })

  it('extracts member access calls (obj.method)', () => {
    const sf = parse('function handler() { store.dispatch() }')
    const { calls } = extractCalls(sf)
    expect(calls).toContainEqual({ callerName: 'handler', calleeName: 'store.dispatch' })
  })

  it('extracts calls inside arrow functions', () => {
    const sf = parse('const run = () => { doSomething() }')
    const { calls } = extractCalls(sf)
    expect(calls).toContainEqual({ callerName: 'run', calleeName: 'doSomething' })
  })

  it('extracts calls inside function expressions', () => {
    const sf = parse('const run = function() { doSomething() }')
    const { calls } = extractCalls(sf)
    expect(calls).toContainEqual({ callerName: 'run', calleeName: 'doSomething' })
  })

  it('extracts calls inside method declarations', () => {
    const sf = parse(`const obj = { handle() { foo() } }`)
    const { calls } = extractCalls(sf)
    expect(calls).toContainEqual({ callerName: 'handle', calleeName: 'foo' })
  })

  it('extracts calls inside property assignment arrow functions', () => {
    const sf = parse(`const obj = { handle: () => { foo() } }`)
    const { calls } = extractCalls(sf)
    expect(calls).toContainEqual({ callerName: 'handle', calleeName: 'foo' })
  })

  it('deduplicates identical calls', () => {
    const sf = parse('function fn() { foo(); foo() }')
    const { calls } = extractCalls(sf)
    const fooCalls = calls.filter((c) => c.calleeName === 'foo')
    expect(fooCalls).toHaveLength(1)
  })

  it('extracts destructured bindings from calls', () => {
    const sf = parse('const { a, b } = useFoo()')
    const { bindings } = extractCalls(sf)
    expect(bindings).toContainEqual({ localName: 'a', sourceFnName: 'useFoo' })
    expect(bindings).toContainEqual({ localName: 'b', sourceFnName: 'useFoo' })
  })

  it('extracts simple variable bindings from calls', () => {
    const sf = parse('const store = useStore()')
    const { bindings } = extractCalls(sf)
    expect(bindings).toContainEqual({ localName: 'store', sourceFnName: 'useStore' })
  })

  it('deduplicates bindings by local name', () => {
    // Technically won't happen in valid TS, but tests the dedup logic
    const sf = parse('const x = foo(); const y = bar()')
    const { bindings } = extractCalls(sf)
    expect(bindings).toHaveLength(2)
  })

  it('returns empty for code with no calls', () => {
    const sf = parse('const x = 5')
    const { calls, bindings } = extractCalls(sf)
    expect(calls).toHaveLength(0)
    expect(bindings).toHaveLength(0)
  })
})
