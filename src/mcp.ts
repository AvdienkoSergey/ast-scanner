import * as readline from 'readline'
import * as path from 'path'
import { scanAndReport } from './scanner'
import { version } from '../package.json'

/* eslint-disable @typescript-eslint/no-explicit-any */

function jsonrpcResponse(id: any, result: any): any {
  return { jsonrpc: '2.0', id, result }
}

function jsonrpcError(id: any, code: number, message: string): any {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function send(msg: any): void {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

const TOOLS = [
  {
    name: 'scan',
    description:
      'Scan a TypeScript/Vue/React project directory. ' +
      'Parses AST, extracts exported functions, and emits fn: entities to aimemory database. ' +
      'Returns a summary with file count and entity count.',
    inputSchema: {
      type: 'object',
      required: ['project', 'db'],
      properties: {
        project: {
          type: 'string',
          description: 'Absolute path to the project source directory to scan'
        },
        db: {
          type: 'string',
          description: 'Absolute path to the aimemory database file'
        },
        ctx: {
          type: 'string',
          description: 'Path to aimemory binary (default: aimemory)'
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to include (default: **/*.ts, **/*.tsx, **/*.vue)'
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Glob patterns to exclude (default: **/node_modules/**, **/dist/**, **/*.d.ts)'
        },
        all: {
          type: 'boolean',
          description: 'Include non-exported functions (default: false)'
        },
        precise: {
          type: 'boolean',
          description:
            'Use TypeScript TypeChecker for accurate cross-file resolution (default: false)'
        }
      }
    }
  },
  {
    name: 'report',
    description:
      'Scan a project and return statistics without writing to the database. ' +
      'Shows file count, function count, and first 20 entities found.',
    inputSchema: {
      type: 'object',
      required: ['project'],
      properties: {
        project: {
          type: 'string',
          description: 'Absolute path to the project source directory to scan'
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to include (default: **/*.ts, **/*.tsx, **/*.vue)'
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Glob patterns to exclude (default: **/node_modules/**, **/dist/**, **/*.d.ts)'
        },
        all: {
          type: 'boolean',
          description: 'Include non-exported functions (default: false)'
        },
        precise: {
          type: 'boolean',
          description:
            'Use TypeScript TypeChecker for accurate cross-file resolution (default: false)'
        }
      }
    }
  }
]

function requireString(args: Record<string, unknown>, key: string, tool: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Tool "${tool}": required parameter "${key}" must be a non-empty string`)
  }
  return value
}

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === 'scan') {
    const projectPath = path.resolve(requireString(args, 'project', name))
    const dbPath = path.resolve(requireString(args, 'db', name))
    const ctxBin = typeof args.ctx === 'string' && args.ctx.length > 0 ? args.ctx : 'aimemory'

    const result = await scanAndReport({
      projectPath,
      dbPath,
      include: Array.isArray(args.include) ? args.include : undefined,
      exclude: Array.isArray(args.exclude) ? args.exclude : undefined,
      exportedOnly: args.all !== true,
      precise: args.precise === true
    })

    // Emit to DB
    const { batchEmit } = await import('./emitter')
    if (result.entities.length > 0) {
      batchEmit(result.entities, dbPath, ctxBin, 50, true)
    }

    const fnCount = result.entities.filter((e) => e.lid.startsWith('fn:')).length
    const compCount = result.entities.filter((e) => e.lid.startsWith('comp:')).length
    return `Scanned ${result.filesScanned} files, emitted ${fnCount} fn + ${compCount} comp entities (${result.refsFound} refs) to ${dbPath}`
  }

  if (name === 'report') {
    const projectPath = path.resolve(requireString(args, 'project', name))

    const result = await scanAndReport({
      projectPath,
      dbPath: '',
      include: Array.isArray(args.include) ? args.include : undefined,
      exclude: Array.isArray(args.exclude) ? args.exclude : undefined,
      exportedOnly: args.all !== true,
      precise: args.precise === true
    })

    const lines = [
      `Files scanned: ${result.filesScanned}`,
      `Functions found: ${result.functionsFound}`,
      `Refs found: ${result.refsFound}`
    ]

    const preview = result.entities.slice(0, 20)
    if (preview.length > 0) {
      lines.push('', 'Entities:')
      for (const e of preview) {
        lines.push(`  ${e.lid}`)
        lines.push(`    ${e.data.signature}`)
        if (e.refs && e.refs.length > 0) {
          for (const ref of e.refs) {
            lines.push(`    → ${ref.target}`)
          }
        }
      }
      if (result.entities.length > 20) {
        lines.push(`  ... and ${result.entities.length - 20} more`)
      }
    }

    return lines.join('\n')
  }

  throw new Error(`Unknown tool: ${name}`)
}

async function handleRequest(msg: any): Promise<any | null> {
  const id = msg.id ?? null
  const method = (msg.method as string) || ''
  const params = msg.params || {}

  switch (method) {
    case 'initialize':
      return jsonrpcResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ctx-scanner', version }
      })

    case 'notifications/initialized':
      return null

    case 'tools/list':
      return jsonrpcResponse(id, { tools: TOOLS })

    case 'tools/call': {
      const toolName = (params.name as string) || ''
      const toolArgs = (params.arguments as any) || {}

      try {
        const text = await handleToolCall(toolName, toolArgs)
        return jsonrpcResponse(id, {
          content: [{ type: 'text', text }]
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return jsonrpcResponse(id, {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true
        })
      }
    }

    case 'ping':
      return jsonrpcResponse(id, {})

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`)
  }
}

export { handleRequest, handleToolCall, requireString }

export function runMcp(): void {
  const rl = readline.createInterface({ input: process.stdin })
  let pending = 0
  let closing = false

  function maybeExit() {
    if (closing && pending === 0) process.exit(0)
  }

  rl.on('line', (line) => {
    if (line.trim() === '') return

    pending++
    ;(async () => {
      try {
        const msg = JSON.parse(line) as any
        const response = await handleRequest(msg)
        if (response) send(response)
      } catch {
        send(jsonrpcError(null, -32700, 'Parse error'))
      } finally {
        pending--
        maybeExit()
      }
    })()
  })

  rl.on('close', () => {
    closing = true
    maybeExit()
  })
}
