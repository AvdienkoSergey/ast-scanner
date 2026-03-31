# ADR-005: Testing strategy

**Status:** Accepted
**Date:** 2025-03-31

## Context

The project has logic for AST parsing, data extraction, and reference resolution. We need to choose a testing approach that keeps things reliable when code changes.

## Decision

Two-level strategy:

### Unit tests (vitest)

Coverage of each module in isolation:

- **extractors/functions** - function declarations, arrow functions, Pinia actions, JSDoc, parameters
- **extractors/imports** - named, default, with aliases
- **extractors/calls** - direct calls, member access, bindings, deduplication
- **extractors/components** - template components, defineProps, defineEmits
- **parsers/typescript** - creating SourceFile, export/async modifiers
- **parsers/vue** - SFC parsing, script setup, function extraction
- **emitter** - functionToEntity, building LID and data

### Integration tests (vitest)

- **scanner** - full cycle scanAndReport with temporary file projects
- Checking cross-file references, export filtering, Vue components

### Property-based tests (fast-check)

Like QuickCheck/QCheck for extra guarantees:

- Generate random combinations of functions and check invariants
- Check that parameter count is correct
- Validate LID format
- Check required fields in entity data

## Reasons

- vitest is fast, has native TypeScript support, works well with the ecosystem
- fast-check is a mature property-based testing library for JS/TS
- Tests on real temporary files (integration) catch problems that unit tests miss

## Results

- Integration tests create temporary directories (cleaned up in finally)
- Property-based tests generate valid TypeScript identifiers with regex-constrained arbitraries
- MCP server and emitToCtx (shell exec) are not covered by automatic tests — they need mocks of external dependencies
