# Requirements — ast-scanner

## Purpose

ast-scanner is a tool for static analysis of TypeScript/Vue/React projects. It gets function signatures and component metadata from source code and saves them in [aimemory](https://github.com/AvdienkoSergey/aimemory) for use by AI agents.

## Functional requirements

### FR-1: Getting functions

- **FR-1.1**: The scanner must get functions from `.ts`, `.tsx`, `.vue` files
- **FR-1.2**: Supported forms: function declarations, arrow functions, function expressions
- **FR-1.3**: For each function it gets: name, signature, parameters, parameter types, return type, async status, export status, JSDoc, line number
- **FR-1.4**: Support for Pinia store actions inside `defineStore()`
- **FR-1.5**: Support for functions inside `<script>` and `<script setup>` blocks in Vue SFC

### FR-2: Getting Vue components

- **FR-2.1**: Getting props with `defineProps<T>()` and `defineProps({})`
- **FR-2.2**: Getting emits with `defineEmits<T>()` and `defineEmits([])`
- **FR-2.3**: Getting child components from `<template>`
- **FR-2.4**: Building `renders` links between parent and child components

### FR-3: Cross-file references

- **FR-3.1**: Resolving direct imports and named exports
- **FR-3.2**: Resolving barrel re-exports through index files
- **FR-3.3**: Support for path alias `@/`
- **FR-3.4**: Resolving destructuring from composables
- **FR-3.5**: Resolving member access (e.g. `store.action()`)
- **FR-3.6**: Precise mode using TypeScript TypeChecker for exact symbol resolution

### FR-4: Identifier format (LID)

- **FR-4.1**: Functions: `fn:{path}/{functionName}` (without `src/` prefix)
- **FR-4.2**: Components: `comp:{path}`
- **FR-4.3**: Module setup: `fn:{path}/__setup__`

### FR-5: Output

- **FR-5.1**: `scan` command — save entities to aimemory database in batches
- **FR-5.2**: `report` command — show stats without writing to database
- **FR-5.3**: `mcp` command — JSON-RPC stdio server for AI agents

### FR-6: MCP server

- **FR-6.1**: Support for JSON-RPC 2.0 protocol through stdin/stdout
- **FR-6.2**: Methods: `initialize`, `tools/list`, `tools/call`, `ping`
- **FR-6.3**: Tools: `scan` and `report`

### FR-7: File filtering

- **FR-7.1**: Include patterns for file selection (default `**/*.ts **/*.tsx **/*.vue`)
- **FR-7.2**: Exclude patterns for file exclusion (default `**/node_modules/** **/dist/** **/*.d.ts`)
- **FR-7.3**: `--all` flag to include non-exported functions

## Non-functional requirements

### NFR-1: Performance

- **NFR-1.1**: Manual mode must process a project in less than 1 second for a typical project (up to 500 files)
- **NFR-1.2**: Precise mode allows 2-5 seconds for the same size

### NFR-2: Compatibility

- **NFR-2.1**: Node.js >= 18
- **NFR-2.2**: TypeScript >= 5.0
- **NFR-2.3**: Vue 3 (Composition API)

### NFR-3: Reliability

- **NFR-3.1**: A parsing error in one file must not stop scanning of other files
- **NFR-3.2**: Batch output with configurable batch size (default 50)

### NFR-4: Extensibility

- **NFR-4.1**: Modular architecture: parsers, extractors, resolvers are separate modules
- **NFR-4.2**: New languages/frameworks are added through new parsers and extractors

## Limits

- Does not get types, interfaces, and stores as separate entities
- Does not support dynamic imports (`import()`)
- Arrow functions without return type get `"unknown"`
- Variable chains are resolved 1 level deep (except in precise mode)
- MCP server is single-user (no concurrent requests)
