# Usage guide for ast-scanner

## Installation

```bash
git clone https://github.com/AvdienkoSergey/ast-scanner.git
cd ast-scanner
npm install
npm run build
npm link   # makes ast-scanner available globally
```

> **What does `npm link` do?**
> It creates a symlink from the global `node_modules` folder to the current package.
> After this, the `ast-scanner` command works in the terminal **from any directory**,
> like the package was installed with `npm install -g`. Changes in source code
> are picked up automatically - it is a symlink, not a copy.
> To remove: `npm unlink -g ast-scanner`.

## Quick start

### Scanning a project

Scans source files and saves found functions to the aimemory database:

```bash
ast-scanner scan -p ./my-project/src -d ./context.db
```

### Report without writing

Shows stats without changing the database:

```bash
ast-scanner report -p ./my-project/src
```

Example output:

```
Files scanned: 42
Functions found: 187
Refs found: 93

Entities:
  fn:composables/useAuth/login
    async login(email: string, password: string): Promise<User>
    -> fn:api/auth/authenticate
  fn:utils/format/formatDate
    formatDate(date: Date, locale?: string): string
```

## CLI commands

### scan

| Flag                          | Required | Default                                   | Description                         |
| ----------------------------- | :------: | ----------------------------------------- | ----------------------------------- |
| `-p, --project <path>`        |   yes    | -                                         | Source code directory of the project |
| `-d, --db <path>`             |   yes    | -                                         | Path to aimemory database            |
| `-c, --ctx <path>`            |    no    | `aimemory`                                | Path to aimemory binary              |
| `-i, --include <patterns...>` |    no    | `**/*.ts **/*.tsx **/*.vue`               | Glob patterns to include             |
| `-e, --exclude <patterns...>` |    no    | `**/node_modules/** **/dist/** **/*.d.ts` | Glob patterns to exclude             |
| `--all`                       |    no    | `false`                                   | Include non-exported functions        |
| `-q, --quiet`                 |    no    | `false`                                   | No output                            |

### report

Same flags as `scan`, except `-d` and `-c` (not needed because there is no writing to database).

### mcp

Starts MCP server (stdio JSON-RPC):

```bash
ast-scanner mcp
```

## MCP integration

ast-scanner works as an MCP server for AI agents. Setup in `.mcp.json`:

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

### Available tools

**`scan`** - scans the project and saves entities to database:

```json
{
  "project": "/path/to/project",
  "db": "/path/to/context.db"
}
```

**`report`** - scans and returns stats without writing:

```json
{
  "project": "/path/to/project"
}
```

## What the scanner gets

### Function forms

- `export function foo() {}` - function declarations
- `export const foo = () => {}` - arrow functions
- `export const foo = function() {}` - function expressions
- Methods inside `defineStore({ actions: { ... } })` - Pinia store actions
- Functions inside `<script>` and `<script setup>` blocks in Vue

### Data for each function

| Field        | Example                                     |
| ------------ | ------------------------------------------- |
| `lid`        | `fn:composables/useAuth/login`              |
| `file`       | `src/composables/useAuth.ts`                |
| `line`       | `15`                                        |
| `signature`  | `async login(email: string): Promise<User>` |
| `params`     | `["email"]`                                 |
| `paramTypes` | `["string"]`                                |
| `returnType` | `Promise<User>`                             |
| `isAsync`    | `true`                                      |
| `isExported` | `true`                                      |
| `jsdoc`      | `"Authenticates user..."`                   |

### Vue components

For `.vue` files, the scanner also gets:

- Props (`defineProps`)
- Emits (`defineEmits`)
- Child components from the template
- `renders` links (component -> child component)

## Resolving references

The scanner builds a dependency graph between functions:

```
fn:pages/Login/submit  ->calls->  fn:composables/useAuth/login
fn:composables/useAuth/login  ->calls->  fn:api/auth/authenticate
```

Supported patterns:

- Direct calls: `helper()` -> looks in the current file and imports
- Member access: `store.dispatch()` -> resolves `store` through import or binding
- Destructuring: `const { fn } = useFoo(); fn()` -> finds `fn` in the `useFoo` module
- Barrel re-exports: `export * from './module'` in index.ts

## LID format

LID (Logical Identifier) is made from the file path:

```
{projectRoot}/src/composables/useAuth.ts  ->  fn:composables/useAuth/{fnName}
{projectRoot}/src/components/Modal.vue    ->  comp:components/Modal
```

Rules:

- The `src/` prefix is removed
- The file extension (`.ts`, `.tsx`, `.vue`) is removed
- The alias `@/` is resolved to `src/`

## Using with aimemory

```bash
# 1. Scan the project
ast-scanner scan -p ./my-project/src -d ./context.db

# 2. Check saved data
aimemory --db ./context.db status

# 3. Query functions by module
aimemory --db ./context.db call query_entities '{"kind":"fn","pattern":"composables/useAuth/*"}'

# 4. AI agent connects through MCP (set up in .mcp.json)
```

## File filtering

By default, `**/*.ts`, `**/*.tsx`, `**/*.vue` files are scanned. To change this:

```bash
# Only TypeScript files
ast-scanner scan -p ./src -d ./ctx.db -i "**/*.ts"

# Exclude tests
ast-scanner scan -p ./src -d ./ctx.db -e "**/*.test.ts" "**/*.spec.ts"

# Include all functions (not only exported)
ast-scanner scan -p ./src -d ./ctx.db --all
```

## Limits

- Only gets functions (`fn:`) and Vue components (`comp:`). Types, interfaces, stores as separate entities are not supported
- Does not get dynamic imports (`import()`)
- For arrow functions without return type, returns `"unknown"`
- Does not follow variable chains deeper than 1 level
