import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { extractFunctions } from '../extractors/functions'
import { extractImports } from '../extractors/imports'
import { extractCalls } from '../extractors/calls'
import { parseTypeScriptFile } from '../parsers/typescript'
import { functionToEntity } from '../emitter'

// --- Arbitraries ---

const tsIdentifier = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,15}$/)

const tsType = fc.constantFrom(
  'string',
  'number',
  'boolean',
  'void',
  'any',
  'unknown',
  'string[]',
  'number[]',
  'Record<string, unknown>',
  'Promise<void>'
)

const paramArb = fc.tuple(tsIdentifier, tsType, fc.boolean()).map(([name, type, optional]) => ({
  name,
  type,
  optional,
  text: `${name}${optional ? '?' : ''}: ${type}`
}))

// --- Property-based tests ---

describe('property-based: extractFunctions', () => {
  it('always extracts exactly the declared exported functions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            tsIdentifier,
            fc.array(paramArb, { maxLength: 4 }),
            tsType,
            fc.boolean(),
            fc.boolean()
          ),
          { minLength: 1, maxLength: 5 }
        ),
        (fnDefs) => {
          // Deduplicate names
          const seen = new Set<string>()
          const unique = fnDefs.filter(([name]) => {
            if (seen.has(name)) return false
            seen.add(name)
            return true
          })

          const code = unique
            .map(([name, params, retType, isAsync, isExported]) => {
              const paramStr = params.map((p) => p.text).join(', ')
              const exp = isExported ? 'export ' : ''
              const async_ = isAsync ? 'async ' : ''
              return `${exp}${async_}function ${name}(${paramStr}): ${retType} {}`
            })
            .join('\n')

          const sf = parseTypeScriptFile('test.ts', code)
          const fns = extractFunctions(sf)

          // Should extract exactly the right count
          expect(fns).toHaveLength(unique.length)

          // Names match
          const extractedNames = new Set(fns.map((f) => f.name))
          for (const [name] of unique) {
            expect(extractedNames.has(name)).toBe(true)
          }

          // Flags match (tuple: [name, params, retType, isAsync, isExported])
          for (const fn of fns) {
            const def = unique.find(([n]) => n === fn.name)!
            expect(fn.isAsync).toBe(def[3])
            expect(fn.isExported).toBe(def[4])
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it('param count always matches declared params', () => {
    fc.assert(
      fc.property(
        fc.tuple(tsIdentifier, fc.array(paramArb, { maxLength: 6 })),
        ([name, params]) => {
          // Deduplicate param names
          const seen = new Set<string>()
          const uniqueParams = params.filter((p) => {
            if (seen.has(p.name)) return false
            seen.add(p.name)
            return true
          })

          const paramStr = uniqueParams.map((p) => p.text).join(', ')
          const code = `export function ${name}(${paramStr}): void {}`

          const sf = parseTypeScriptFile('test.ts', code)
          const fns = extractFunctions(sf)

          expect(fns).toHaveLength(1)
          expect(fns[0].params).toHaveLength(uniqueParams.length)
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe('property-based: extractImports', () => {
  it('always extracts the correct number of named imports', () => {
    fc.assert(
      fc.property(fc.array(tsIdentifier, { minLength: 1, maxLength: 5 }), (names) => {
        const unique = [...new Set(names)]
        const importStr = unique.join(', ')
        const code = `import { ${importStr} } from './module'`

        const sf = parseTypeScriptFile('test.ts', code)
        const imports = extractImports(sf)

        expect(imports).toHaveLength(unique.length)
        for (const imp of imports) {
          expect(imp.moduleSpecifier).toBe('./module')
          expect(imp.localName).toBe(imp.importedName)
        }
      }),
      { numRuns: 50 }
    )
  })
})

describe('property-based: extractCalls', () => {
  it('calls inside a function always have the correct caller name', () => {
    fc.assert(
      fc.property(
        tsIdentifier,
        fc.array(tsIdentifier, { minLength: 1, maxLength: 4 }),
        (fnName, callees) => {
          const uniqueCallees = [...new Set(callees)].filter((c) => c !== fnName)
          if (uniqueCallees.length === 0) return

          const callStr = uniqueCallees.map((c) => `${c}()`).join('; ')
          const code = `function ${fnName}() { ${callStr} }`

          const sf = parseTypeScriptFile('test.ts', code)
          const { calls } = extractCalls(sf)

          for (const call of calls) {
            if (uniqueCallees.includes(call.calleeName)) {
              expect(call.callerName).toBe(fnName)
            }
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})

describe('property-based: functionToEntity', () => {
  it('LID always follows fn:{path}/{name} format', () => {
    fc.assert(
      fc.property(
        tsIdentifier,
        fc.constantFrom('utils', 'composables', 'services', 'helpers'),
        (fnName, dir) => {
          const entity = functionToEntity(
            {
              name: fnName,
              signature: `${fnName}(): void`,
              params: [],
              returnType: 'void',
              isAsync: false,
              isExported: true,
              line: 1
            },
            `/project/src/${dir}/file.ts`,
            '/project'
          )

          expect(entity.lid).toBe(`fn:${dir}/file/${fnName}`)
          expect(entity.lid).toMatch(/^fn:[a-zA-Z0-9/]+$/)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('entity data always contains required fields', () => {
    fc.assert(
      fc.property(
        tsIdentifier,
        tsType,
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 1, max: 1000 }),
        (name, retType, isAsync, isExported, line) => {
          const entity = functionToEntity(
            {
              name,
              signature: `${name}(): ${retType}`,
              params: [],
              returnType: retType,
              isAsync,
              isExported,
              line
            },
            '/p/src/mod.ts',
            '/p'
          )

          expect(entity.data.file).toBeDefined()
          expect(entity.data.line).toBe(line)
          expect(entity.data.signature).toBeDefined()
          expect(entity.data.returnType).toBe(retType)
          expect(entity.data.isAsync).toBe(isAsync)
          expect(entity.data.isExported).toBe(isExported)
          expect(entity.refs).toEqual([])
        }
      ),
      { numRuns: 50 }
    )
  })
})
