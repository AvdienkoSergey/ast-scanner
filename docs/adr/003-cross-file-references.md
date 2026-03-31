# ADR-003: Resolving cross-file references

**Status:** Accepted
**Date:** 2025-03-31

## Context

To build a dependency graph between functions, we need to resolve calls through imports, barrel re-exports, and destructuring from composables.

## Decision

Three-pass analysis:

1. **Pass 1 - Extraction**: From each file we get functions, imports, calls, and bindings
2. **Pass 2 - Resolving calls**: We match calls with target functions through imports
3. **Pass 3 - Vue components**: We build links between components based on template usage

### Resolution methods

- **Direct calls** (`foo()`): look in the current file, then in imports
- **Member access** (`obj.method()`): resolve `obj` through import or binding, then find `method` in the target file
- **Barrel re-exports** (`export * from`, `export { X } from`): follow the chain of index.ts to the real file
- **Destructuring** (`const { fn } = useFoo()`): track through `CallBinding` and resolve `fn` in the module where `useFoo` comes from
- **Alias @/**: resolves to `{projectRoot}/src/`

## Reasons

- Three-pass approach lets us build a full function index before resolving references
- Caching barrel mappings (`barrelCache`) avoids re-parsing index.ts files
- Fallback heuristic for Pinia stores (file name matching) covers cases where `useXStore` is not a function but a result of `defineStore`

## Alternatives

- **TypeScript Language Service**: Would give exact type resolution, but needs tsconfig and is much slower
- **Static single-pass analysis**: Cannot resolve barrel re-exports

## Results

- Dynamic imports (`import()`) are not resolved
- Calls through variable chains deeper than 1 level are not resolved
- Barrel cache is cleared between analysis runs
