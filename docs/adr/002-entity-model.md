# ADR-002: Entity model

**Status:** Accepted
**Date:** 2025-03-31

## Context

The scanner must represent extracted data in a format that works with [aimemory protocol](https://github.com/AvdienkoSergey/aimemory/blob/main/lib/domain/protocol.ml). We need to define the entity structure and the identifier format (LID).

## Decision

We use three entity types:

### `fn:` - functions

LID format: `fn:{path}/{name}`, where path is relative from project root without `src/` and file extension.

```
src/composables/useAuth.ts  ->  fn:composables/useAuth/login
src/utils/format.ts         ->  fn:utils/format/formatDate
```

Data: `file`, `line`, `signature`, `params`, `paramTypes`, `returnType`, `isAsync`, `isExported`, `jsdoc`.

### `comp:` - Vue components

LID format: `comp:{path}`, same as `fn:` but without the function name.

Data: `file`, `line`, `name`, `props`, `emits`, `children`.

### `__setup__` - module level calls

Virtual entity `fn:{path}/__setup__` for top-level calls (composables in `<script setup>`).

## Reasons

- LID format gives unique and readable identifiers
- Removing `src/` makes LID shorter and not tied to a specific folder structure
- `__setup__` lets you track which composables are used in a component at the top level

## Results

- LID depends on the file path - renaming a file changes all related LIDs
- Files outside `src/` keep the full relative path in LID
- `__setup__` is created only when there are top-level calls
