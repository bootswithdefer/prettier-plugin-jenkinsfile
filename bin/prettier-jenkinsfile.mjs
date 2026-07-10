#!/usr/bin/env node
// Wrapper so pre-commit / prek can run prettier with this plugin without
// relying on prettier's deprecated mirrors-prettier hook or the plugin being
// published to npm. Resolves both the prettier CLI and this plugin by
// absolute path, so it works inside pre-commit's isolated node environment
// where `--plugin <name>` resolution is unreliable.
//
// All arguments are forwarded to prettier after `--write --plugin <plugin>`,
// so pre-commit's matched file list is appended automatically.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginPath = join(pkgRoot, 'src', 'index.js');

let prettierBin;
try {
  const prettierPkgJson = require.resolve('prettier/package.json');
  const prettierPkg = require('prettier/package.json');
  const binField =
    typeof prettierPkg.bin === 'string' ? prettierPkg.bin : prettierPkg.bin.prettier;
  prettierBin = join(dirname(prettierPkgJson), binField);
} catch {
  console.error(
    'prettier-plugin-jenkinsfile: prettier not found. Add "prettier" to the ' +
      'hook\'s additional_dependencies (pre-commit/prek) or install it.',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [prettierBin, '--write', '--plugin', pluginPath, ...args],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
