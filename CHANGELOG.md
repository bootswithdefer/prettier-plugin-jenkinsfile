# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-11

### Added

- Assignment printing: a DSL call on the right-hand side of an assignment
  (e.g. `output = terraform(...)`) now has its arguments reformatted /
  expanded one-per-line, the same as a statement-position call. Previously
  assignment nodes were emitted verbatim, so an assignment-RHS `terraform()`
  stayed on a single line.

### Changed

- Rebuilt the bundled `tree-sitter-groovy.wasm` from tree-sitter-groovy
  0.2.0, which parses a much wider range of real-world Jenkinsfiles: robust
  groovydoc (`/** ... */`), `key=value` named arguments, and
  capitalized/mixed-case assignment targets (`TF_VAR_x = ...`).

## [0.1.2] - 2026-07-10

### Added

- GitHub Actions workflow (`.github/workflows/publish.yml`) that publishes
  releases to npm via OIDC trusted publishing (no stored token, with
  provenance), triggered on `v*` tags. Actions are pinned to commit SHAs.

### Changed

- README: replaced internal pipeline config in examples with generic ones,
  linked the forked `tree-sitter-groovy`, and added pre-commit/prek setup.

## [0.1.1] - 2026-07-10

### Added

- `bin/prettier-jenkinsfile.mjs` executable (`prettier-jenkinsfile`) that runs
  Prettier with this plugin resolved by absolute path — works inside
  pre-commit/prek's isolated node environment where `--plugin <name>`
  resolution is unreliable.
- `.pre-commit-hooks.yaml` exposing a `jenkinsfile-fmt` hook so consumers can
  use this repo directly as a `pre-commit`/`prek` hook (Prettier's own
  `mirrors-prettier` is archived and does not support Prettier 3.x). Usage:

  ```yaml
  - repo: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile
    rev: v0.1.1
    hooks:
      - id: jenkinsfile-fmt
  ```

- `bin` field, `bin/` in published `files`, and an `engines.node >= 18`
  constraint for npm publishing.

## [0.1.0] - 2026-07-10

First versioned release. A Prettier plugin that formats Jenkins Declarative
Pipeline and general Groovy files, using `web-tree-sitter` with a bundled
`tree-sitter-groovy` WASM grammar (v0.1.0). Verified across the sample
Jenkinsfile corpus and shared pipeline library: every formatted file re-parses
cleanly and preserves token-level content (whitespace and trailing commas aside).

### Added

- Prettier `groovy-parse` parser and document-IR printer.
- `src/parse-check.js` for detecting tree-sitter parse errors (ERROR and MISSING
  nodes) in a file.
- Force multi-line block form for pipeline DSL blocks, so short single-statement
  bodies are not collapsed onto one line: `agent`, `options`, `triggers`,
  `stages`, `steps`, `post`, `environment`, `parameters`, `when`, `parallel`,
  `script`, `dir`, `expression`, `always`, `anyOf`, `not`, `stage`, `container`.
- `terraform`/`ansible`/`tofu` family calls always expand named arguments to one
  per line with a trailing comma when they have any parameters.
- Verbatim safety net: when the parser mis-splits a single source line into
  multiple sibling statements, that run is emitted verbatim rather than mangled.

### Fixed

- Preserve blank lines between statements, both at the top level and inside
  closures.
- Named-argument calls use fit-based breaking (inline when they fit, one per line
  with a trailing comma when too long) instead of always exploding.
- Positional arguments are no longer dropped from calls that also contain named
  arguments.
- Preserve an explicit declaration type: `String x = ...` is no longer rewritten
  to `def x = ...`.
- Preserve closure parameters: `{ f -> ... }` keeps its parameter and `->`.
- Preserve (possibly empty) parens on a trailing closure: `foo() { }` stays
  `foo() { }`; a closure passed as an argument `foo({ })` is distinguished.
- No spurious blank line after the `#!groovy` shebang.

[Unreleased]: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile/releases/tag/v0.1.0
