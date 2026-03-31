import { describe, it, expect } from 'vitest'
import {
  parseTypeScriptFile,
  hasExportModifier,
  hasAsyncModifier,
  getNodeText
} from '../parsers/typescript'
import { parseVueFile, parseVueFileFull, extractVueFunctions } from '../parsers/vue'
import * as ts from 'typescript'

describe('parseTypeScriptFile', () => {
  it('parses valid TypeScript', () => {
    const sf = parseTypeScriptFile('test.ts', 'const x: number = 5')
    expect(sf.fileName).toBe('test.ts')
    expect(sf.statements.length).toBeGreaterThan(0)
  })

  it('sets parent nodes', () => {
    const sf = parseTypeScriptFile('test.ts', 'const x = 5')
    const stmt = sf.statements[0]
    expect(stmt.parent).toBe(sf)
  })
})

describe('hasExportModifier', () => {
  it('returns true for exported node', () => {
    const sf = parseTypeScriptFile('test.ts', 'export const x = 5')
    expect(hasExportModifier(sf.statements[0])).toBe(true)
  })

  it('returns false for non-exported node', () => {
    const sf = parseTypeScriptFile('test.ts', 'const x = 5')
    expect(hasExportModifier(sf.statements[0])).toBe(false)
  })
})

describe('hasAsyncModifier', () => {
  it('returns true for async function', () => {
    const sf = parseTypeScriptFile('test.ts', 'async function foo() {}')
    const fn = sf.statements[0] as ts.FunctionDeclaration
    expect(hasAsyncModifier(fn)).toBe(true)
  })

  it('returns false for sync function', () => {
    const sf = parseTypeScriptFile('test.ts', 'function foo() {}')
    const fn = sf.statements[0] as ts.FunctionDeclaration
    expect(hasAsyncModifier(fn)).toBe(false)
  })
})

describe('getNodeText', () => {
  it('returns text of node', () => {
    const sf = parseTypeScriptFile('test.ts', 'function foo(): string {}')
    const fn = sf.statements[0] as ts.FunctionDeclaration
    expect(getNodeText(fn.type, sf)).toBe('string')
  })

  it('returns empty string for undefined node', () => {
    const sf = parseTypeScriptFile('test.ts', 'const x = 5')
    expect(getNodeText(undefined, sf)).toBe('')
  })
})

describe('parseVueFile', () => {
  it('parses script setup', () => {
    const result = parseVueFile(
      `<script setup lang="ts">
const msg = 'hello'
</script>`,
      'Test.vue'
    )
    expect(result).not.toBeNull()
    expect(result!.isSetup).toBe(true)
    expect(result!.lang).toBe('ts')
    expect(result!.content).toContain("const msg = 'hello'")
  })

  it('parses regular script', () => {
    const result = parseVueFile(
      `<script lang="ts">
export default { name: 'Test' }
</script>`,
      'Test.vue'
    )
    expect(result).not.toBeNull()
    expect(result!.isSetup).toBe(false)
  })

  it('returns null when no script', () => {
    const result = parseVueFile('<template><div /></template>', 'Test.vue')
    expect(result).toBeNull()
  })

  it('prefers script setup over script', () => {
    const result = parseVueFile(
      `<script lang="ts">
export default {}
</script>
<script setup lang="ts">
const x = 1
</script>`,
      'Test.vue'
    )
    expect(result!.isSetup).toBe(true)
  })
})

describe('parseVueFileFull', () => {
  it('extracts component name from filename', () => {
    const result = parseVueFileFull('<template><div /></template>', 'MyComponent.vue')
    expect(result.componentName).toBe('MyComponent')
  })

  it('extracts template content', () => {
    const result = parseVueFileFull(
      '<template><div class="test">hello</div></template>',
      'Test.vue'
    )
    expect(result.templateContent).toContain('hello')
  })

  it('returns null template when no template block', () => {
    const result = parseVueFileFull('<script setup lang="ts">const x = 1</script>', 'Test.vue')
    expect(result.templateContent).toBeNull()
  })
})

describe('extractVueFunctions', () => {
  it('extracts functions from script setup', () => {
    const fns = extractVueFunctions(
      `<script setup lang="ts">
function greet(name: string): string {
  return name
}
</script>`,
      'Test.vue'
    )
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('greet')
  })

  it('returns empty for template-only component', () => {
    const fns = extractVueFunctions('<template><div /></template>', 'Test.vue')
    expect(fns).toHaveLength(0)
  })

  it('adjusts line numbers to account for script tag offset', () => {
    const fns = extractVueFunctions(
      `<template><div /></template>
<script setup lang="ts">
function foo(): void {}
</script>`,
      'Test.vue'
    )
    expect(fns).toHaveLength(1)
    // foo is on line 1 within the script, but script starts at line 2
    expect(fns[0].line).toBeGreaterThan(1)
  })
})
