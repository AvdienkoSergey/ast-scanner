# ADR-006: --precise mode with TypeScript TypeChecker

**Status:** Accepted
**Date:** 2026-03-31

## Context

In [ADR-003](003-cross-file-references.md) we described the manual three-pass approach to resolving cross-file references. This approach covers ~85-90% of real calls, but has limits:

- Does not resolve variable chains deeper than 1 level
- Does not support namespace imports (`import * as utils`)
- Does not resolve path aliases except `@/`
- Uses heuristics for Pinia stores (file name matching)
- For arrow functions without type annotation, returns `"unknown"` instead of the computed type

## Decision

Added the `--precise` flag, which replaces Pass 2 (manual reference resolution) with resolution through **TypeScript TypeChecker** (`ts.createProgram` + `checker.getSymbolAtLocation`).

### Architecture

Two resolvers with the same interface:

```
src/resolvers/
  manual.ts   - manual resolution (default, fast)
  precise.ts  - TypeChecker (--precise, accurate)
```

Both return `Map<string, Set<string>>` (callerLid -> Set<targetLid>), which makes them interchangeable in `scanner.ts`:

```typescript
const entityRefs = precise
  ? resolveRefsPrecise(analyses, fnIndex, projectPath)
  : resolveRefsManual(analyses, fnIndex, projectPath)
```

### How precise resolver works

1. Looks for `tsconfig.json` with `ts.findConfigFile()`. If not found - creates default config
2. Creates `ts.Program` with a custom `CompilerHost` that intercepts reading of `.vue` files and uses the extracted `<script>` block as a virtual `.vue.ts` file
3. Gets `TypeChecker` from the program
4. For each `CallExpression` in AST:
   - `checker.getSymbolAtLocation()` - gets the symbol of the called identifier
   - `checker.getAliasedSymbol()` - follows re-export chains
   - `symbol.valueDeclaration.getSourceFile()` - finds the file where it is defined
   - Matches with `fnIndex` to get the target LID

### What gets better

| Scenario                                |   manual    |   precise   |
| --------------------------------------- | :---------: | :---------: |
| Direct calls of imported functions      |    ~95%     |    ~99%     |
| Barrel re-exports (`export *`)          |    ~85%     |    ~99%     |
| Path aliases from tsconfig              | only `@/`   | all aliases |
| Variable chains >1 level               |     0%      |    ~90%     |
| Namespace imports (`import * as X`)     |     0%      |    ~99%     |

### Vue support

Custom `CompilerHost` intercepts access to `.vue` files:

- `host.readFile('Component.vue.ts')` - returns the `<script>` block content
- `host.fileExists('Component.vue.ts')` - returns `true` for files with extracted script
- Virtual files are added to the program file list

## Reasons

- TypeChecker gives the most accurate symbol resolution - it is the same mechanism that IDEs use
- The mode is optional (`--precise`), so it does not slow down standard usage
- The resolver interface is the same - switching is transparent to the rest of the code

## Alternatives

- **TypeScript Language Service instead of Program**: Language Service is more convenient for interactive use, but for batch analysis `ts.createProgram` is more efficient and easier to use
- **Extending the manual resolver**: We could add namespace imports and path aliases support to the manual resolver, but that would copy TypeScript compiler logic

## Results

- `--precise` is slower: ~2-5 seconds for 100 files vs ~50ms in manual mode
- Needs `tsconfig.json` for full path aliases support (without it, works with default config)
- Vue files are processed through virtual `.vue.ts` files - this may not cover all edge cases of SFC-specific syntax
- Refactoring: reference resolution logic was moved from `scanner.ts` to separate modules `resolvers/manual.ts` and `resolvers/precise.ts`
