# Agent Instructions — prettier-plugin-jenkinsfile

Guidance for AI agents (and humans) working on this repo. Read this before making changes.

## What this is

A [Prettier](https://prettier.io/) plugin that formats Jenkins Declarative Pipeline
files (`Jenkinsfile`) and Groovy/Gradle files. It parses with a **forked
tree-sitter-groovy** grammar compiled to WebAssembly and bundled here, then emits
Prettier's document IR.

- Published to npm as `prettier-plugin-jenkinsfile`.
- Ships a `pre-commit`/`prek` hook (`jenkinsfile-fmt`).

## Two coupled repos

| Repo | Role |
|------|------|
| `bootswithdefer/prettier-plugin-jenkinsfile` (this repo) | The Prettier plugin + bundled `tree-sitter-groovy.wasm` |
| `bootswithdefer/tree-sitter-groovy` | The forked grammar (extends `murtaza64/tree-sitter-groovy`). Source of the WASM. |

Grammar changes happen in the grammar repo, then the rebuilt `.wasm` is copied here.
**The plugin does not parse Groovy itself — it loads the bundled WASM.**

## Layout

```
src/index.js      Prettier entry: languages, parser "groovy-parse", printer "groovy-ast".
                  Loads tree-sitter-groovy.wasm via web-tree-sitter.
src/printer.js    The doc-IR printer. This is where almost all formatting logic lives.
src/parse-check.js  Standalone parse-error detector (flags ERROR *and* MISSING nodes).
bin/prettier-jenkinsfile.mjs  CLI wrapper for the pre-commit hook (resolves plugin by
                  absolute path so it works in pre-commit's isolated node env).
tree-sitter-groovy.wasm       Bundled compiled grammar.
.pre-commit-hooks.yaml        Exposes the `jenkinsfile-fmt` hook (language: node).
.github/workflows/publish.yml Publishes to npm on `v*` tags via OIDC trusted publishing.
```

## Development loop

### Format a file (primary loop)
```bash
npx prettier --plugin ./src/index.js --parser groovy-parse path/to/Jenkinsfile
```
`--parser groovy-parse` is optional — the plugin auto-detects `Jenkinsfile`, `*.groovy`,
`*.gradle`. Prettier is a devDependency; `npm install` first if `node_modules` is missing.

### Check for parse errors
```bash
node src/parse-check.js path/to/Jenkinsfile ...
```
Use this (not `grep ERROR`) — it also catches MISSING nodes that a raw parse won't show.

### Change the grammar / rebuild the WASM
Grammar edits are made in the **grammar repo**, then rebuilt and copied here:
```bash
cd /path/to/tree-sitter-groovy
# edit grammar.js
tree-sitter generate
tree-sitter build --wasm --output tree-sitter-groovy.wasm
cp tree-sitter-groovy.wasm /path/to/prettier-plugin-jenkinsfile/tree-sitter-groovy.wasm
```
**CRITICAL:** parser behavior will not change here until the WASM is rebuilt AND copied.
The grammar repo enforces 138 corpus tests + 100% named-node-type coverage via `prek`.

## Printer design (`src/printer.js`)

Uses Prettier builders: `group, indent, hardline, softline, line, join, ifBreak`.
`printNode` dispatches by tree-sitter node type; unknown or `ERROR` nodes fall back to
verbatim source (`nodeText`). Key rules:

- **Always-block DSL closures** — `forcesBlockClosure()` / `BLOCK_CLOSURE_FNS`: these are
  never collapsed to one line: `agent, options, triggers, stages, steps, post,
  environment, parameters, when, parallel, script, dir, expression, always, anyOf, stage,
  container, not`. Works for both `foo(...) { }` (function_call) and `foo { }` (juxt).
- **Always-expand named args** — `alwaysExpandArgs()`: `terraform`, `ansible`, `tofu*`
  calls always break named args one-per-line with a trailing comma, even if they'd fit.
- **Fit-based named args** — all other calls with named args: inline if they fit, else
  one-per-line with a trailing comma (`group` + `softline`/`line`/`ifBreak`).
- **Short closures** — a single short statement is inlined *if it fits* (unless forceBlock).
- **Closure parameters** preserved: `{ a, b -> ... }` keeps the params and `->`.
- **Declaration prefix** preserved from source — `String x = ...` is NOT rewritten to
  `def x = ...` (never assume `def`).
- **Blank lines** between statements preserved, at top level and inside closures.
- **Trailing-closure parens** preserved: `foo() { }` stays `foo() { }`; `foo({ })`
  (closure passed as an argument) is distinguished.
- **Verbatim safety net** — `groupStatements()`: when the parser mis-splits one source
  line into several sibling statement nodes (a known ambiguity, e.g. a method chain with a
  trailing closure deep in command-syntax context), that run is emitted verbatim rather
  than mangled. No-op for normal one-statement-per-line code.

## Known parser gotchas (grammar)

Groovy is genuinely ambiguous; a few things can't be cleanly resolved without a
whitespace-sensitive external scanner:
- Method chains with a trailing closure in deeply-nested command-syntax context can
  mis-parse (handled by the printer's verbatim safety net — token-preserving).
- Capitalized bare variable names (`Foo = 1`) can lex as a type (`TYPE_REGEX`).

The parser is named `groovy-parse`; the language is `groovy`.

## Testing before you commit formatter changes

Formatting must be **safe** (never change tokens) and **valid** (output re-parses).

1. **Round-trip:** format each file, run `parse-check` on the output → expect 0 errors.
2. **Content-equivalence:** normalize input vs output (strip comments + whitespace +
   trailing commas, **string-aware** so `//` inside `https://` URLs isn't treated as a
   comment) and compare → must be identical.
3. **Corpus:** the ASU Jenkinsfiles (`~/tf/*/Jenkinsfile`) and pipeline library
   (`~/tf/devops-jenkins-pipeline-library/vars/*.groovy`) must stay at 0 parse errors.
4. `node --check src/*.js bin/*.mjs` for JS syntax.

Prettier is slow to invoke per-file — **cache formatted output to temp files and reuse it**
across checks instead of re-running prettier for each verification.

## Release process

1. Make + verify changes.
2. Bump `version` in `package.json`, then sync the lockfile: `npm install --package-lock-only`
   (the publish workflow runs `npm ci`, which fails if they drift).
3. Move `CHANGELOG.md` `[Unreleased]` entries under a new dated `[X.Y.Z]`; update the links.
4. `git commit -m "chore(release): X.Y.Z"`.
5. `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin main vX.Y.Z`.
6. The `publish.yml` Action publishes to npm via **OIDC trusted publishing** (no token, no
   OTP, with provenance). Trusted publishing is already configured on npmjs.com for this
   package/workflow.

Follows [SemVer](https://semver.org/), [Keep a Changelog](https://keepachangelog.com/), and
[Conventional Commits](https://www.conventionalcommits.org/).

## Pre-commit / prek hook

`.pre-commit-hooks.yaml` exposes `jenkinsfile-fmt` (`language: node`), which runs
`bin/prettier-jenkinsfile.mjs` with `prettier` as an `additional_dependencies`. Consumers add:
```yaml
- repo: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile
  rev: vX.Y.Z
  hooks:
    - id: jenkinsfile-fmt
```
We ship our own hook because Prettier's `pre-commit/mirrors-prettier` is archived and
does not support Prettier 3. Consumer repos (e.g. `ASU/dot-devops-examples-terraform`,
which also templates it via copier) pin to a frozen SHA + `# frozen: vX.Y.Z`.

## Conventions / rules

- **No internal config in the README or examples** — no real Vault callbacks
  (`opsVaultLogin`), Slack channels, Vault URLs, agent labels, or repo-specific step args.
  Use generic placeholders (`my-service`, `production`, `retry(3) { sh '...' }`).
  Regenerate before/after examples with the actual formatter so they stay accurate.
- **Pin GitHub Actions to commit SHAs** — use `pinact run -u` (updates + pins). Note
  `actions/setup-node@v6` removed the `always-auth` input; keep `node-version` on a current LTS.
- Don't commit generated churn; keep `package-lock.json` in sync with `package.json`.
