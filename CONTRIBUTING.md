# Contributing to ast-scanner

Thank you for your interest in the project! This document describes the development process and rules for making changes.

## Branching Strategy

The project uses **GitHub Flow**:

1. `main` - stable branch, always in working state
2. For each task, create a **feature branch** from `main`
3. Changes go through a **Pull Request** with required code review
4. After PR is approved, it is merged to `main` with squash merge

### Branch naming

```
feat/short-description    - new feature
fix/short-description     - bug fix
docs/short-description    - documentation changes
refactor/short-description - refactoring without behavior change
test/short-description    - adding or changing tests
```

## Commit Convention

The project uses [Conventional Commits](https://www.conventionalcommits.org/) to automatically create CHANGELOG and manage versions:

```
feat: add Vue 3 defineModel support
fix: resolve barrel re-export infinite loop
docs: update usage guide with MCP examples
test: add property-based tests for extractors
refactor: simplify three-pass scanner logic
perf: cache parsed barrel exports
chore: update dependencies
```

## Development Workflow

### Setting up the environment

```bash
git clone https://github.com/AvdienkoSergey/ast-scanner.git
cd ast-scanner
npm install
npm run build
```

### Before sending a PR

```bash
npm run build          # compiles without errors
npm run lint           # linter passes
npm run format:check   # formatting is correct
npm test               # all tests pass
npm run test:coverage  # coverage is above the limit
```

### Running in dev mode

```bash
npm run watch          # watch compilation
npm run test:watch     # tests in watch mode
```

## Code Review

- Each PR needs at least one approve from a code owner
- CI must be green before merge
- Reviewer checks: correctness, tests, documentation, code style
- PR author must resolve all comments

## Code Style

- TypeScript strict mode
- Formatting with Prettier (config in `.prettierrc`)
- Linting with ESLint (config in `eslint.config.js`)
- No semicolons, single quotes

## Testing

- Unit tests for each module (`src/__tests__/`)
- Property-based tests with fast-check for edge cases
- Integration tests with temporary projects
- Code coverage is checked in CI

## Reporting Issues

- Use Issue templates on GitHub
- **Bug Report** - for bugs
- **Feature Request** - for ideas

## Releases

Releases are managed automatically with [release-please](https://github.com/googleapis/release-please). When you merge to `main`, a PR with version update and CHANGELOG is created.

## Code of Conduct

Please read and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
