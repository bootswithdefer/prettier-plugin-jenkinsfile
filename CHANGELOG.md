# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile/releases/tag/v0.1.0
