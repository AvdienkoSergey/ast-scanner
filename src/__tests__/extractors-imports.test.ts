import { describe, it, expect } from 'vitest'
import { extractImports } from '../extractors/imports'
import { parseTypeScriptFile } from '../parsers/typescript'

function parse(code: string) {
  return parseTypeScriptFile('test.ts', code)
}

describe('extractImports', () => {
  it('extracts named imports', () => {
    const sf = parse("import { foo, bar } from './module'")
    const imports = extractImports(sf)
    expect(imports).toHaveLength(2)
    expect(imports[0]).toEqual({
      localName: 'foo',
      importedName: 'foo',
      moduleSpecifier: './module'
    })
    expect(imports[1]).toEqual({
      localName: 'bar',
      importedName: 'bar',
      moduleSpecifier: './module'
    })
  })

  it('extracts aliased imports', () => {
    const sf = parse("import { foo as myFoo } from './module'")
    const imports = extractImports(sf)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toEqual({
      localName: 'myFoo',
      importedName: 'foo',
      moduleSpecifier: './module'
    })
  })

  it('extracts default imports', () => {
    const sf = parse("import MyComponent from './MyComponent.vue'")
    const imports = extractImports(sf)
    expect(imports).toHaveLength(1)
    expect(imports[0]).toEqual({
      localName: 'MyComponent',
      importedName: 'default',
      moduleSpecifier: './MyComponent.vue'
    })
  })

  it('extracts both default and named imports', () => {
    const sf = parse("import React, { useState, useEffect } from 'react'")
    const imports = extractImports(sf)
    expect(imports).toHaveLength(3)
    expect(imports[0]).toEqual({
      localName: 'useState',
      importedName: 'useState',
      moduleSpecifier: 'react'
    })
    expect(imports[1]).toEqual({
      localName: 'useEffect',
      importedName: 'useEffect',
      moduleSpecifier: 'react'
    })
    expect(imports[2]).toEqual({
      localName: 'React',
      importedName: 'default',
      moduleSpecifier: 'react'
    })
  })

  it('returns empty for files with no imports', () => {
    const sf = parse('const x = 5')
    const imports = extractImports(sf)
    expect(imports).toHaveLength(0)
  })

  it('ignores side-effect imports', () => {
    const sf = parse("import './styles.css'")
    const imports = extractImports(sf)
    expect(imports).toHaveLength(0)
  })

  it('handles multiple import statements', () => {
    const sf = parse(`
import { a } from './a'
import { b } from './b'
import c from './c'
`)
    const imports = extractImports(sf)
    expect(imports).toHaveLength(3)
  })
})
