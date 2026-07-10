# prettier-plugin-jenkinsfile

A [Prettier](https://prettier.io/) plugin for formatting Jenkins Declarative Pipeline files (Jenkinsfile) and Groovy files.

Uses [tree-sitter-groovy](https://github.com/murtaza64/tree-sitter-groovy) for parsing, producing AST-aware formatting that understands Groovy's named parameter syntax and Jenkins DSL patterns.

## Features

- One named argument per line with trailing commas in function calls like `terraform()`, `ansible()`
- Short closures kept inline: `{ opsVaultLogin() }`
- Multi-statement closures expanded to block format
- Triple-quoted strings (YAML pod specs) preserved verbatim
- Proper 2-space indentation throughout
- Jenkins DSL blocks (`pipeline`, `stages`, `stage`, `steps`, `agent`, etc.) formatted consistently

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

## Example

**Before:**
```groovy
#!groovy
def slack_channel = '#prdfam-ad-ci'
pipeline {
  agent {
    label 'ec2-docker'
  }
  stages {
    stage('terraform prod') {
      steps {
        script {
          terraform(workspace: 'prod',vault_callback:{opsVaultLogin()})
        }
      }
    }
  }
}
```

**After:**
```groovy
#!groovy

def slack_channel = '#prdfam-ad-ci'
pipeline {
  agent { label 'ec2-docker' }
  stages {
    stage('terraform prod') {
      steps {
        script {
          terraform(
            workspace: 'prod',
            vault_callback: { opsVaultLogin() },
          )
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
