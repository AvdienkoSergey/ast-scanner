import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { scanAndReport } from '../scanner'

function createTempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
  const srcDir = path.join(dir, 'src')
  fs.mkdirSync(srcDir, { recursive: true })

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(srcDir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
  }

  return dir
}

function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true })
}

describe('scanAndReport', () => {
  it('scans TypeScript files and returns entities', async () => {
    const dir = createTempProject({
      'utils.ts': `
export function formatDate(d: Date): string { return '' }
export const parseId = (id: string): number => parseInt(id)
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true
      })

      expect(result.filesScanned).toBe(1)
      expect(result.functionsFound).toBe(2)
      const lids = result.entities.map((e) => e.lid)
      expect(lids).toContain('fn:utils/formatDate')
      expect(lids).toContain('fn:utils/parseId')
    } finally {
      cleanup(dir)
    }
  })

  it('respects exportedOnly flag', async () => {
    const dir = createTempProject({
      'helper.ts': `
export function pub(): void {}
function priv(): void {}
`
    })

    try {
      const exported = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true
      })
      expect(exported.functionsFound).toBe(1)

      const all = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: false
      })
      expect(all.functionsFound).toBe(2)
    } finally {
      cleanup(dir)
    }
  })

  it('scans Vue files', async () => {
    const dir = createTempProject({
      'components/Modal.vue': `
<template>
  <div>Modal</div>
</template>
<script setup lang="ts">
function close(): void {}
</script>
`
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.vue'],
        exclude: [],
        exportedOnly: false
      })
      expect(result.filesScanned).toBe(1)
      // Should have fn entity for close and comp entity for Modal
      const lids = result.entities.map((e) => e.lid)
      expect(lids.some((l) => l.includes('close'))).toBe(true)
      expect(lids.some((l) => l.startsWith('comp:'))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('resolves cross-file refs', async () => {
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
        exportedOnly: true
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

  it('excludes files matching exclude patterns', async () => {
    const dir = createTempProject({
      'utils.ts': 'export function a(): void {}',
      'utils.d.ts': 'export declare function b(): void'
    })

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: ['**/*.d.ts'],
        exportedOnly: true
      })
      const lids = result.entities.map((e) => e.lid)
      expect(lids.some((l) => l.includes('/a'))).toBe(true)
      expect(lids.some((l) => l.includes('/b'))).toBe(false)
    } finally {
      cleanup(dir)
    }
  })

  it('returns zero for empty project', async () => {
    const dir = createTempProject({})

    try {
      const result = await scanAndReport({
        projectPath: dir,
        dbPath: '',
        include: ['**/*.ts'],
        exclude: [],
        exportedOnly: true
      })
      expect(result.filesScanned).toBe(0)
      expect(result.functionsFound).toBe(0)
    } finally {
      cleanup(dir)
    }
  })
})
