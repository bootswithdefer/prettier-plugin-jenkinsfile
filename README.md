# prettier-plugin-jenkinsfile

A [Prettier](https://prettier.io/) plugin for formatting Jenkins Declarative Pipeline files (Jenkinsfile) and Groovy files.

Uses a [forked tree-sitter-groovy](https://github.com/bootswithdefer/tree-sitter-groovy) (extended from [murtaza64/tree-sitter-groovy](https://github.com/murtaza64/tree-sitter-groovy)) for parsing, producing AST-aware formatting that understands Groovy's named parameter syntax and Jenkins DSL patterns.

## Features

- `terraform()`, `ansible()`, and `tofu*` calls always expand named arguments one per line with trailing commas
- Short single-statement closures kept inline (e.g. `retry(3) { sh 'make' }`)
- Multi-statement closures expanded to block format
- Triple-quoted strings (YAML pod specs) preserved verbatim
- Proper 2-space indentation throughout
- Jenkins DSL blocks (`pipeline`, `stages`, `stage`, `steps`, `agent`, `dir`, `when`, etc.) always kept in block form

## Installation

```bash
npm install --save-dev prettier-plugin-jenkinsfile
```

## Usage

```bash
# Format a Jenkinsfile
npx prettier --write Jenkinsfile

# Format all Jenkinsfiles in a directory
npx prettier --write '**/Jenkinsfile'

# Check formatting (CI mode)
npx prettier --check Jenkinsfile
```

The plugin automatically detects files named `Jenkinsfile` and files with `.groovy` or `.gradle` extensions.

## Pre-commit / prek hook

This repo ships a [pre-commit](https://pre-commit.com/) hook (also compatible with [prek](https://github.com/j178/prek)). Add it to your `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/bootswithdefer/prettier-plugin-jenkinsfile
    rev: v0.1.1
    hooks:
      - id: jenkinsfile-fmt
```

The hook formats files named `Jenkinsfile` and files with `.groovy` or `.gradle` extensions on commit. It runs Prettier with this plugin in an isolated Node environment managed by pre-commit — no Node project or global install required.

## Example

**Before:**
```groovy
#!groovy
def appName = 'my-service'
pipeline {
  agent { label 'linux' }
  stages {
    stage('deploy') {
      steps {
        script {
          terraform(workspace: 'production', auto_approve: true)
          retry(3) {
            sh './deploy.sh'
          }
        }
      }
    }
  }
}
```

**After:**
```groovy
#!groovy
def appName = 'my-service'
pipeline {
  agent {
    label 'linux'
  }
  stages {
    stage('deploy') {
      steps {
        script {
          terraform(
            workspace: 'production',
            auto_approve: true,
          )
          retry(3) { sh './deploy.sh' }
        }
      }
    }
  }
}
```

## Configuration

This plugin uses Prettier's standard configuration. Relevant options:

| Option | Default | Description |
|--------|---------|-------------|
| `tabWidth` | `2` | Indentation width |
| `printWidth` | `80` | Line width for inline/expand decisions |

## How It Works

1. Parses the file using `tree-sitter-groovy` (via WebAssembly)
2. Walks the concrete syntax tree (CST)
3. Emits Prettier's intermediate representation (doc IR)
4. Prettier handles line-breaking, indentation, and output

The plugin bundles a pre-compiled `tree-sitter-groovy.wasm` — no native dependencies required.

## Limitations

- Does not format arbitrary Groovy (class definitions, complex expressions). Focused on Jenkins Pipeline DSL patterns.
- Comments attached to the end of a line may move to the next line.
- The parser handles most Declarative Pipeline patterns but may not parse highly unusual Scripted Pipeline code.

## License

MIT
