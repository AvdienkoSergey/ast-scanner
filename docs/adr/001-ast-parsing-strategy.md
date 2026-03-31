# ADR-001: AST parsing strategy

**Status:** Accepted
**Date:** 2025-03-31

## Context

The scanner needs to get information about functions from TypeScript, TSX, and Vue source files. There are several ways to parse: regular expressions, third-party parsers (Babel, SWC), or the native TypeScript Compiler API.

## Decision

We use **TypeScript Compiler API** (`typescript` package, `ts.createSourceFile` function) to parse all files.

For Vue SFC we use `@vue/compiler-sfc` to get `<script>` and `<template>` blocks, and then parse the script with the same TypeScript Compiler API.

## Reasons

- TypeScript Compiler API gives a full AST tree with types, modifiers, and node positions
- No extra dependencies — `typescript` is already the main dependency of the project
- Supports TSX out of the box
- `@vue/compiler-sfc` is the official Vue parser, it is correct for SFC parsing

## Alternatives

- **Babel**: Would need extra plugins for TypeScript and JSX. Less accurate for TS-specific things
- **SWC**: Faster, but needs Rust dependency and the API is less convenient for AST inspection from Node.js
- **Regular expressions**: Fragile, cannot handle nested structures and edge cases

## Results

- Parsing speed is limited by TypeScript compiler (enough for typical projects)
- TypeScript updates can change the internal API (we only use public functions)
- Vue files need two-step parsing: SFC => script => AST
