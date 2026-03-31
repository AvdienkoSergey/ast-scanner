#!/usr/bin/env node

import { Command } from 'commander'
import * as path from 'path'
import { scanProject, scanAndReport } from './scanner'
import { runMcp } from './mcp'
import { version } from '../package.json'

const program = new Command()

program
  .name('aimemory-scanner')
  .description('TypeScript/Vue/React scanner for aimemory context memory')
  .version(version)

program
  .command('scan')
  .description('Scan project and emit fn: entities to aimemory')
  .requiredOption('-p, --project <path>', 'Project source directory')
  .requiredOption('-d, --db <path>', 'aimemory database path')
  .option('-c, --ctx <path>', 'Path to aimemory binary', 'aimemory')
  .option('-i, --include <patterns...>', 'Glob patterns to include', [
    '**/*.ts',
    '**/*.tsx',
    '**/*.vue'
  ])
  .option('-e, --exclude <patterns...>', 'Glob patterns to exclude', [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.d.ts'
  ])
  .option('--all', 'Include non-exported functions', false)
  .option('--precise', 'Use TypeScript TypeChecker for accurate cross-file resolution', false)
  .option('-q, --quiet', 'Suppress output', false)
  .action(async (options) => {
    const projectPath = path.resolve(options.project)
    const dbPath = path.resolve(options.db)
    const ctxBin = options.ctx.startsWith('/') ? options.ctx : path.resolve(options.ctx)

    await scanProject({
      projectPath,
      dbPath,
      ctxBin,
      include: options.include,
      exclude: options.exclude,
      exportedOnly: !options.all,
      quiet: options.quiet,
      precise: options.precise
    })
  })

program
  .command('report')
  .description('Scan project and report statistics (no emit)')
  .requiredOption('-p, --project <path>', 'Project source directory')
  .option('-i, --include <patterns...>', 'Glob patterns to include', [
    '**/*.ts',
    '**/*.tsx',
    '**/*.vue'
  ])
  .option('-e, --exclude <patterns...>', 'Glob patterns to exclude', [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.d.ts'
  ])
  .option('--all', 'Include non-exported functions', false)
  .option('--precise', 'Use TypeScript TypeChecker for accurate cross-file resolution', false)
  .action(async (options) => {
    const projectPath = path.resolve(options.project)

    const result = await scanAndReport({
      projectPath,
      dbPath: '', // not used in report
      include: options.include,
      exclude: options.exclude,
      exportedOnly: !options.all,
      precise: options.precise
    })

    console.log(`Files scanned: ${result.filesScanned}`)
    console.log(`Functions found: ${result.functionsFound}`)
    console.log(`Refs found: ${result.refsFound}`)

    if (result.entities.length <= 20) {
      console.log('\nEntities:')
      for (const entity of result.entities) {
        console.log(`  ${entity.lid}`)
        console.log(`    ${entity.data.signature}`)
        if (entity.refs && entity.refs.length > 0) {
          for (const ref of entity.refs) {
            console.log(`    → ${ref.target}`)
          }
        }
      }
    }
  })

program
  .command('mcp')
  .description('Start MCP server (stdio JSON-RPC)')
  .action(() => {
    runMcp()
  })

program.parse()
