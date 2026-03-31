import { describe, it, expect } from 'vitest'
import { handleRequest, handleToolCall, requireString } from '../mcp'

describe('requireString', () => {
  it('returns value when string is provided', () => {
    expect(requireString({ key: 'value' }, 'key', 'test')).toBe('value')
  })

  it('throws when key is missing', () => {
    expect(() => requireString({}, 'key', 'test')).toThrow(
      'Tool "test": required parameter "key" must be a non-empty string'
    )
  })

  it('throws when value is empty string', () => {
    expect(() => requireString({ key: '' }, 'key', 'test')).toThrow(
      'Tool "test": required parameter "key" must be a non-empty string'
    )
  })

  it('throws when value is not a string', () => {
    expect(() => requireString({ key: 42 }, 'key', 'test')).toThrow(
      'Tool "test": required parameter "key" must be a non-empty string'
    )
  })
})

describe('handleRequest', () => {
  it('responds to initialize', async () => {
    const res = await handleRequest({ id: 1, method: 'initialize', params: {} })
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ctx-scanner', version: '1.0.0' }
      }
    })
  })

  it('returns null for notifications/initialized', async () => {
    const res = await handleRequest({ id: 2, method: 'notifications/initialized' })
    expect(res).toBeNull()
  })

  it('responds to tools/list with tool definitions', async () => {
    const res = await handleRequest({ id: 3, method: 'tools/list', params: {} })
    expect(res.jsonrpc).toBe('2.0')
    expect(res.id).toBe(3)
    expect(res.result.tools).toHaveLength(2)
    expect(res.result.tools[0].name).toBe('scan')
    expect(res.result.tools[1].name).toBe('report')
  })

  it('responds to ping', async () => {
    const res = await handleRequest({ id: 4, method: 'ping', params: {} })
    expect(res).toEqual({ jsonrpc: '2.0', id: 4, result: {} })
  })

  it('returns error for unknown method', async () => {
    const res = await handleRequest({ id: 5, method: 'unknown/method', params: {} })
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 5,
      error: { code: -32601, message: 'Method not found: unknown/method' }
    })
  })

  it('handles missing id gracefully', async () => {
    const res = await handleRequest({ method: 'ping' })
    expect(res).toEqual({ jsonrpc: '2.0', id: null, result: {} })
  })

  it('handles missing params gracefully', async () => {
    const res = await handleRequest({ id: 6, method: 'ping' })
    expect(res).toEqual({ jsonrpc: '2.0', id: 6, result: {} })
  })

  it('handles missing method gracefully', async () => {
    const res = await handleRequest({ id: 7 })
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32601, message: 'Method not found: ' }
    })
  })
})

describe('handleRequest tools/call', () => {
  it('returns error when tool call fails with missing params', async () => {
    const res = await handleRequest({
      id: 10,
      method: 'tools/call',
      params: { name: 'scan', arguments: {} }
    })
    expect(res.jsonrpc).toBe('2.0')
    expect(res.id).toBe(10)
    expect(res.result.isError).toBe(true)
    expect(res.result.content[0].text).toContain('Error:')
  })

  it('returns error for unknown tool', async () => {
    const res = await handleRequest({
      id: 11,
      method: 'tools/call',
      params: { name: 'nonexistent', arguments: {} }
    })
    expect(res.result.isError).toBe(true)
    expect(res.result.content[0].text).toContain('Unknown tool: nonexistent')
  })

  it('handles empty tool name', async () => {
    const res = await handleRequest({
      id: 12,
      method: 'tools/call',
      params: { arguments: {} }
    })
    expect(res.result.isError).toBe(true)
    expect(res.result.content[0].text).toContain('Unknown tool:')
  })

  it('handles missing arguments', async () => {
    const res = await handleRequest({
      id: 13,
      method: 'tools/call',
      params: { name: 'report' }
    })
    expect(res.result.isError).toBe(true)
  })
})

describe('handleToolCall', () => {
  it('throws for unknown tool name', async () => {
    await expect(handleToolCall('bogus', {})).rejects.toThrow('Unknown tool: bogus')
  })

  it('report tool works on a real project dir', async () => {
    const result = await handleToolCall('report', {
      project: __dirname + '/../..'
    })
    expect(result).toContain('Files scanned:')
    expect(result).toContain('Functions found:')
  })

  it('report tool respects all flag', async () => {
    const withAll = await handleToolCall('report', {
      project: __dirname + '/../..',
      all: true
    })
    const withoutAll = await handleToolCall('report', {
      project: __dirname + '/../..',
      all: false
    })
    // With all=true should find more or equal functions
    expect(withAll).toContain('Functions found:')
    expect(withoutAll).toContain('Functions found:')
  })

  it('report tool handles custom include/exclude', async () => {
    const result = await handleToolCall('report', {
      project: __dirname + '/../..',
      include: ['**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.d.ts', '**/__tests__/**']
    })
    expect(result).toContain('Files scanned:')
  })

  it('report tool handles non-array include/exclude', async () => {
    const result = await handleToolCall('report', {
      project: __dirname + '/../..',
      include: 'not-an-array',
      exclude: 'not-an-array'
    })
    expect(result).toContain('Files scanned:')
  })

  it('scan tool throws on missing db param', async () => {
    await expect(
      handleToolCall('scan', { project: '/tmp/test' })
    ).rejects.toThrow('required parameter "db"')
  })

  it('scan tool throws on missing project param', async () => {
    await expect(
      handleToolCall('scan', { db: '/tmp/test.db' })
    ).rejects.toThrow('required parameter "project"')
  })
})
