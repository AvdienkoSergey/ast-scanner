# Changelog

## 1.0.0 (2026-03-31)


### ⚠ BREAKING CHANGES

* establishes stable public API contract for v1.0.0

### Features

* add AST extractors for functions, imports, calls, and Vue components ([5e87560](https://github.com/AvdienkoSergey/ast-scanner/commit/5e87560113cb0763a911b43d03d9bc187d2cd417))
* add CLI with scan, report, and mcp commands ([c0ea9c7](https://github.com/AvdienkoSergey/ast-scanner/commit/c0ea9c761d01269a2ff2c934b528b9dd632e1a50))
* add core type definitions ([6bb768b](https://github.com/AvdienkoSergey/ast-scanner/commit/6bb768b72c68b5e4bacde1937f886d8aca6102da))
* add emitter for batched entity emission to aimemory ([d87f968](https://github.com/AvdienkoSergey/ast-scanner/commit/d87f96801a12811aeda26aa8900d7330c54ff369))
* add LID builder for unique entity identifiers ([600c6ed](https://github.com/AvdienkoSergey/ast-scanner/commit/600c6eddac9be509685110fc7e2527ca4c4d3cbc))
* add manual cross-file reference resolver with barrel support ([bac152b](https://github.com/AvdienkoSergey/ast-scanner/commit/bac152b651fe387ce72a24ee2e1ade281c5564c2))
* add MCP server with JSON-RPC stdio transport ([cb0e9e4](https://github.com/AvdienkoSergey/ast-scanner/commit/cb0e9e444fa29788201d59fb5d33db7a014d5213))
* add precise TypeScript TypeChecker-based reference resolver ([3dbb9d7](https://github.com/AvdienkoSergey/ast-scanner/commit/3dbb9d7f8828b467df9f708004021213da918160))
* add three-pass project scanner ([4248bd5](https://github.com/AvdienkoSergey/ast-scanner/commit/4248bd509498ec060ecf9e12e15dd292b1eb8237))
* add TypeScript and Vue SFC parsers ([32fec03](https://github.com/AvdienkoSergey/ast-scanner/commit/32fec0395f92d6db3644a2767f46c7f9d0beca93))
* release v1.0.0 ([664903d](https://github.com/AvdienkoSergey/ast-scanner/commit/664903db4508ce65fd5476da6b8b1ef7d028f2e2))


### Bug Fixes

* **lint:** disable no-non-null-assertion for tests and declare ESM type ([6e3de1e](https://github.com/AvdienkoSergey/ast-scanner/commit/6e3de1ed9ec83106916a102cce4868293de81526))
* **test:** remove unused vi import and update version expectation ([09ec160](https://github.com/AvdienkoSergey/ast-scanner/commit/09ec160357527113aae9d57915fc49e44784ec38))
