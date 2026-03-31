import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { scanAndReport } from '../scanner'

function createTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precise-test-'))
  const srcDir = path.join(dir, 'src')
  fs.mkdirSync(srcDir, { recursive: true })

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(srcDir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
  }

  // Create tsconfig.json
  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'commonjs',
          strict: true,
          esModuleInterop: true,
          baseUrl: '.',
          paths: { '@/*': ['src/*'] },
          skipLibCheck: true
        },
        include: ['src/**/*']
      },
      null,
      2
    )
  )

  return dir
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('precise resolver: basic cross-file refs', () => {
  it('resolves direct imported function calls', async () => {
    const dir = createTempProject({
      'utils.ts': `export function helper(): void {}`,
      'main.ts': `
import { helper } from './utils'
export function run(): void { helper() }
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const runEntity = result.entities.find((e) => e.lid.includes('run'))
      expect(runEntity).toBeDefined()
      expect(runEntity!.refs).toBeDefined()
      expect(runEntity!.refs!.length).toBeGreaterThan(0)
      expect(runEntity!.refs![0].target).toContain('helper')
      expect(runEntity!.refs![0].rel).toBe('calls')
    } finally {
      cleanup(dir)
    }
  })

  it('produces same results as manual for simple cases', async () => {
    const dir = createTempProject({
      'utils.ts': `export function formatDate(d: Date): string { return '' }`,
      'main.ts': `
import { formatDate } from './utils'
export function render(): void { formatDate(new Date()) }
`
    })

    try {
      const manual = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: false
      })
      const precise = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      // Same entity count
      expect(precise.functionsFound).toBe(manual.functionsFound)

      // Both should find the ref
      const manualRun = manual.entities.find((e) => e.lid.includes('render'))
      const preciseRun = precise.entities.find((e) => e.lid.includes('render'))
      expect(manualRun!.refs!.length).toBeGreaterThan(0)
      expect(preciseRun!.refs!.length).toBeGreaterThan(0)
      expect(manualRun!.refs![0].target).toBe(preciseRun!.refs![0].target)
    } finally {
      cleanup(dir)
    }
  })
})

describe('precise resolver: barrel re-exports', () => {
  it('resolves through export * from barrel', async () => {
    const dir = createTempProject({
      'utils/math.ts': `export function add(a: number, b: number): number { return a + b }`,
      'utils/index.ts': `export * from './math'`,
      'main.ts': `
import { add } from './utils'
export function calc(): number { return add(1, 2) }
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const calcEntity = result.entities.find((e) => e.lid.includes('calc'))
      expect(calcEntity).toBeDefined()
      expect(calcEntity!.refs).toBeDefined()
      expect(calcEntity!.refs!.length).toBeGreaterThan(0)
      expect(calcEntity!.refs![0].target).toContain('math/add')
    } finally {
      cleanup(dir)
    }
  })

  it('resolves through named re-exports', async () => {
    const dir = createTempProject({
      'utils/format.ts': `export function formatDate(): string { return '' }`,
      'utils/index.ts': `export { formatDate } from './format'`,
      'main.ts': `
import { formatDate } from './utils'
export function render(): void { formatDate() }
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const renderEntity = result.entities.find((e) => e.lid.includes('render'))
      expect(renderEntity).toBeDefined()
      expect(renderEntity!.refs!.length).toBeGreaterThan(0)
      expect(renderEntity!.refs![0].target).toContain('format/formatDate')
    } finally {
      cleanup(dir)
    }
  })

  it('resolves through transitive re-exports (a -> b -> c)', async () => {
    const dir = createTempProject({
      'deep/impl.ts': `export function deepFn(): void {}`,
      'mid/index.ts': `export { deepFn } from '../deep/impl'`,
      'top/index.ts': `export { deepFn } from '../mid'`,
      'main.ts': `
import { deepFn } from './top'
export function entry(): void { deepFn() }
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const entryEntity = result.entities.find((e) => e.lid.includes('entry'))
      expect(entryEntity).toBeDefined()
      expect(entryEntity!.refs!.length).toBeGreaterThan(0)
      expect(entryEntity!.refs![0].target).toContain('impl/deepFn')
    } finally {
      cleanup(dir)
    }
  })
})

describe('precise resolver: aliased imports', () => {
  it('resolves aliased named imports', async () => {
    const dir = createTempProject({
      'utils.ts': `export function original(): void {}`,
      'main.ts': `
import { original as aliased } from './utils'
export function caller(): void { aliased() }
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const callerEntity = result.entities.find((e) => e.lid.includes('caller'))
      expect(callerEntity).toBeDefined()
      expect(callerEntity!.refs!.length).toBeGreaterThan(0)
      expect(callerEntity!.refs![0].target).toContain('original')
    } finally {
      cleanup(dir)
    }
  })
})

describe('precise resolver: same-file calls', () => {
  it('resolves calls within the same file', async () => {
    const dir = createTempProject({
      'utils.ts': `
export function helper(): void {}
export function main(): void { helper() }
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const mainEntity = result.entities.find((e) => e.lid.includes('/main'))
      expect(mainEntity).toBeDefined()
      expect(mainEntity!.refs!.length).toBeGreaterThan(0)
      expect(mainEntity!.refs![0].target).toContain('helper')
    } finally {
      cleanup(dir)
    }
  })
})

describe('precise resolver: no tsconfig fallback', () => {
  it('works without tsconfig.json using default options', async () => {
    const dir = createTempProject({
      'utils.ts': `export function helper(): void {}`,
      'main.ts': `
import { helper } from './utils'
export function run(): void { helper() }
`
    })

    // Remove tsconfig.json to test fallback
    fs.unlinkSync(path.join(dir, 'tsconfig.json'))

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      // Should still find functions
      expect(result.functionsFound).toBeGreaterThanOrEqual(2)

      // Refs may or may not resolve without tsconfig, but should not crash
      expect(result.entities.length).toBeGreaterThan(0)
    } finally {
      cleanup(dir)
    }
  })
})

describe('precise resolver: multiple callers', () => {
  it('resolves refs from multiple functions to the same target', async () => {
    const dir = createTempProject({
      'shared.ts': `export function validate(): boolean { return true }`,
      'handlers.ts': `
import { validate } from './shared'
export function handleA(): void { validate() }
export function handleB(): void { validate() }
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const handleA = result.entities.find((e) => e.lid.includes('handleA'))
      const handleB = result.entities.find((e) => e.lid.includes('handleB'))

      expect(handleA!.refs!.length).toBeGreaterThan(0)
      expect(handleB!.refs!.length).toBeGreaterThan(0)
      expect(handleA!.refs![0].target).toContain('validate')
      expect(handleB!.refs![0].target).toContain('validate')
    } finally {
      cleanup(dir)
    }
  })
})

describe('precise resolver: module-level calls', () => {
  it('tracks top-level calls as __setup__ refs', async () => {
    const dir = createTempProject({
      'init.ts': `export function setup(): void {}`,
      'main.ts': `
import { setup } from './init'
setup()
export function run(): void {}
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true,
        precise: true
      })

      const setupEntity = result.entities.find((e) => e.lid.includes('__setup__'))
      expect(setupEntity).toBeDefined()
      expect(setupEntity!.refs!.length).toBeGreaterThan(0)
      expect(setupEntity!.refs![0].target).toContain('setup')
    } finally {
      cleanup(dir)
    }
  })
})

describe('precise resolver: excludes files', () => {
  it('respects exclude patterns', async () => {
    const dir = createTempProject({
      'main.ts': `export function run(): void {}`,
      'main.d.ts': `export declare function other(): void`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: ['**/*.d.ts'],
        exportedOnly: true,
        precise: true
      })

      const lids = result.entities.map((e) => e.lid)
      expect(lids.some((l) => l.includes('run'))).toBe(true)
      expect(lids.some((l) => l.includes('other'))).toBe(false)
    } finally {
      cleanup(dir)
    }
  })
})
