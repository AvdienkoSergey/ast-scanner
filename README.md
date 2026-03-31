# ast-scanner

[![CI](https://github.com/AvdienkoSergey/ast-scanner/actions/workflows/ci.yml/badge.svg)](https://github.com/AvdienkoSergey/ast-scanner/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/AvdienkoSergey/ast-scanner/branch/main/graph/badge.svg)](https://codecov.io/gh/AvdienkoSergey/ast-scanner)

AST scanner for TypeScript/Vue projects. It gets function signatures from source code and saves them in [aimemory](https://github.com/AvdienkoSergey/aimemory) as `fn:` entities. I use this scanner to go deep to the function level, so the AI agent does not need to read many files.

AI agents can ask for the pre-built function index through aimemory MCP instead of reading files one by one.

## How it works

```
source files         ast-scanner           aimemory
 .ts .tsx .vue  -->  TypeScript AST  -->  fn: entities
                      parser              in SQLite
                                              ^
                                              | MCP (query_entities, query_refs)
                                              |
                                          AI agent
```

The scanner reads source files, parses them with TypeScript Compiler API (or `@vue/compiler-sfc` for Vue), gets function definitions, and sends them to aimemory in batches.

## Important info from benchmarks

The benchmark was done on two real projects with the [`bench.ts`](bench.ts) script. Full results are in [`docs/benchmark-results.md`](docs/benchmark-results.md).

**How to run:**

```bash
npm run bench
```

The script runs each setup: 2 warmup + 7 measurements, takes the median. Memory is measured as peak RSS.

**Results summary:**

| Project              | Mode    | Files | Functions | Refs  | Median  | Stddev | Peak RSS |
|----------------------|---------|-------|-----------|-------|---------|--------|----------|
| Small (315 files)    | manual  | 315   | 407       | 633   | 152ms   | 2ms    | 219 MB   |
| Small (315 files)    | precise | 315   | 406       | 632   | 1.06s   | 21ms   | 652 MB   |
| Large (1 417 files)  | manual  | 1 417 | 1 407     | 1 326 | 1.08s   | 19ms   | 624 MB   |
| Large (1 417 files)  | precise | 1 417 | 1 397     | 1 195 | 2.45s   | 239ms  | 665 MB   |

> **Note:** On small projects, manual and precise give almost the same results (633 vs 632 refs). On large projects, manual finds ~11% more refs (1 326 vs 1 195) - some of them are false links because of fuzzy name matching. **For projects with more than 500 files where ref accuracy matters, use `--precise`.**

## Installation

```bash
npm install && npm run build
npm link   # makes ast-scanner available globally
```

## Quick start

```bash
# Scan a project and save to database
ast-scanner scan -p ./src -d ./context.db

# See the report without writing to database
ast-scanner report -p ./src
```

## MCP server (stdio)

ast-scanner works as an MCP server. AI agents can call `scan` and `report` tools directly.

```json
{
  "mcpServers": {
    "scanner": {
      "type": "stdio",
      "command": "ast-scanner",
      "args": ["mcp"]
    }
  }
}
```

Run manually for testing:

```bash
ast-scanner mcp
```

The server reads JSON-RPC from stdin (one message per line) and writes answers to stdout. It has two tools: `scan` (parse + write to aimemory) and `report` (parse + return stats).

## CLI commands

### scan

Scans the project and saves entities to aimemory:

```bash
ast-scanner scan -p ./src -d ./context.db
```

| Flag                          | Required | Default                                   | Description                         |
| ----------------------------- | :------: | ----------------------------------------- | ----------------------------------- |
| `-p, --project <path>`        |   yes    | -                                         | Source code directory                |
| `-d, --db <path>`             |   yes    | -                                         | Path to aimemory database            |
| `-c, --ctx <path>`            |    no    | `aimemory`                                | Path to aimemory binary              |
| `-i, --include <patterns...>` |    no    | `**/*.ts **/*.tsx **/*.vue`               | Glob patterns to include             |
| `-e, --exclude <patterns...>` |    no    | `**/node_modules/** **/dist/** **/*.d.ts` | Glob patterns to exclude             |
| `--all`                       |    no    | `false`                                   | Include non-exported functions        |
| `-q, --quiet`                 |    no    | `false`                                   | No output                            |

### report

Scans the project and shows stats without writing to database:

```bash
ast-scanner report -p ./src
```

Same flags as `scan`, except `-d` and `-c`.

### mcp

Starts MCP server:

```bash
ast-scanner mcp
```

## What the scanner gets

| Field        | Example                                                       |
| ------------ | ------------------------------------------------------------- |
| `lid`        | `fn:composables/useAuth/login`                                |
| `file`       | `src/composables/useAuth.ts`                                  |
| `line`       | `15`                                                          |
| `signature`  | `async login(email: string, password: string): Promise<User>` |
| `params`     | `["email", "password"]`                                       |
| `paramTypes` | `["string", "string"]`                                        |
| `returnType` | `Promise<User>`                                               |
| `isAsync`    | `true`                                                        |
| `isExported` | `true`                                                        |
| `jsdoc`      | `"Authenticates user by email..."`                            |

Supported function forms:

- `export function foo() {}` - declarations
- `export const foo = () => {}` - arrow functions
- `export const foo = function() {}` - function expressions
- Pinia store actions in `defineStore({ actions: { ... } })`
- Functions inside `<script>` and `<script setup>` blocks in Vue

## Vue components

For `.vue` files the scanner gets:

- Props with `defineProps<T>()` and `defineProps({})`
- Emits with `defineEmits<T>()` and `defineEmits([...])`
- Child components from `<template>`
- `renders` links between components

## LID format

```
src/composables/useAuth.ts  ->  fn:composables/useAuth/login
src/utils/format.ts         ->  fn:utils/format/formatDate
src/components/Modal.vue    ->  fn:components/Modal/onClose
```

The `src/` prefix is removed automatically.

## Development

```bash
npm install
npm run build         # compile TypeScript
npm run lint          # run linter
npm run format:check  # check formatting
npm test              # run tests
npm run test:coverage # tests with coverage
npm run test:watch    # tests in watch mode
```

## Testing

The project uses [vitest](https://vitest.dev/) for unit and integration tests, and [fast-check](https://fast-check.dev/) for property-based testing. Code coverage is checked with v8 provider and minimum limits.

```bash
npm test              # tests without coverage
npm run test:coverage # tests with coverage report
```

## Documentation

- [Requirements](docs/requirements.md)
- [Usage guide](docs/usage-guide.md)
- [ADR (Architecture Decision Records)](docs/adr/)
- [Contributing guide](CONTRIBUTING.md)

## Releases

Releases are managed with [release-please](https://github.com/googleapis/release-please). When you merge to `main`, a PR with version update and CHANGELOG is created automatically.

## Limits

- Only gets `fn:` (functions) and `comp:` (Vue components). Types, stores as separate entities are not supported yet
- Does not get dynamic imports
- For arrow functions without return type, uses `"unknown"`
- Does not follow variable chains deeper than 1 level
- Files are processed one by one. Benchmarks show linear scaling (~0.9 ms/file manual, ~1.1 ms/file precise) is enough up to ~5 000 files. Parallel parsing can be added if this limit is passed

## License

MIT
