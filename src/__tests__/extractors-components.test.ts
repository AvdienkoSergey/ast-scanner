import { describe, it, expect } from 'vitest'
import {
  extractTemplateComponents,
  extractDefineProps,
  extractDefineEmits
} from '../extractors/components'
import { parseTypeScriptFile } from '../parsers/typescript'

function parse(code: string) {
  return parseTypeScriptFile('test.ts', code)
}

describe('extractTemplateComponents', () => {
  it('extracts PascalCase component usage', () => {
    const result = extractTemplateComponents('<div><MyButton /><UserCard /></div>')
    expect(result).toContain('MyButton')
    expect(result).toContain('UserCard')
  })

  it('converts kebab-case to PascalCase', () => {
    const result = extractTemplateComponents('<div><my-button /></div>')
    expect(result).toContain('MyButton')
  })

  it('ignores HTML tags', () => {
    const result = extractTemplateComponents('<div><span>text</span><input /></div>')
    expect(result).toHaveLength(0)
  })

  it('ignores Vue built-in components', () => {
    const result = extractTemplateComponents(
      '<transition><keep-alive><router-view /></keep-alive></transition>'
    )
    expect(result).toHaveLength(0)
  })

  it('deduplicates component names', () => {
    const result = extractTemplateComponents('<div><MyBtn /><MyBtn /></div>')
    expect(result.filter((c) => c === 'MyBtn')).toHaveLength(1)
  })

  it('returns empty for invalid template', () => {
    const result = extractTemplateComponents('<<<invalid>>>')
    expect(result).toEqual([])
  })

  it('handles nested components', () => {
    const result = extractTemplateComponents('<Outer><Inner /></Outer>')
    expect(result).toContain('Outer')
    expect(result).toContain('Inner')
  })
})

describe('extractDefineProps', () => {
  it('extracts typed defineProps<T>()', () => {
    const sf = parse('defineProps<{ name: string; age?: number }>()')
    const props = extractDefineProps(sf)
    expect(props).toHaveLength(2)
    expect(props[0]).toEqual({ name: 'name', type: 'string', required: true })
    expect(props[1]).toEqual({ name: 'age', type: 'number', required: false })
  })

  it('extracts runtime defineProps({})', () => {
    const sf = parse(`defineProps({
  title: { type: String, required: true },
  count: { type: Number }
})`)
    const props = extractDefineProps(sf)
    expect(props).toHaveLength(2)
    expect(props[0]).toEqual({ name: 'title', type: 'String', required: true })
    expect(props[1]).toEqual({ name: 'count', type: 'Number', required: false })
  })

  it('extracts shorthand runtime defineProps', () => {
    const sf = parse(`defineProps({ label: String })`)
    const props = extractDefineProps(sf)
    expect(props).toHaveLength(1)
    expect(props[0]).toEqual({ name: 'label', type: 'String', required: false })
  })

  it('returns empty when no defineProps', () => {
    const sf = parse('const x = 5')
    expect(extractDefineProps(sf)).toHaveLength(0)
  })
})

describe('extractDefineEmits', () => {
  it('extracts typed defineEmits<T>()', () => {
    const sf = parse("defineEmits<{ (e: 'submit'): void; (e: 'cancel'): void }>()")
    const emits = extractDefineEmits(sf)
    expect(emits).toEqual(['submit', 'cancel'])
  })

  it('extracts array defineEmits', () => {
    const sf = parse("defineEmits(['submit', 'cancel'])")
    const emits = extractDefineEmits(sf)
    expect(emits).toEqual(['submit', 'cancel'])
  })

  it('returns empty when no defineEmits', () => {
    const sf = parse('const x = 5')
    expect(extractDefineEmits(sf)).toHaveLength(0)
  })
})
