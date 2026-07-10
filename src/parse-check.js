#!/usr/bin/env node
/**
 * Parse Jenkinsfile/Groovy files and report tree-sitter parse errors.
 * Exit code 0 = no errors, 1 = errors found.
 *
 * Usage: node parse-check.js [files...]
 *        cat file | node parse-check.js --stdin
 */
import { Parser, Language } from "web-tree-sitter";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wasmPath = join(__dirname, "..", "tree-sitter-groovy.wasm");

await Parser.init();
const lang = await Language.load(wasmPath);
const parser = new Parser();
parser.setLanguage(lang);

function findErrors(node, errors = []) {
  if (node.type === "ERROR" || node.isMissing) {
    errors.push({
      type: node.type,
      startRow: node.startPosition.row + 1,
      startCol: node.startPosition.column,
      endRow: node.endPosition.row + 1,
      endCol: node.endPosition.column,
    });
  }
  for (let i = 0; i < node.childCount; i++) {
    findErrors(node.child(i), errors);
  }
  return errors;
}

const args = process.argv.slice(2);
let hasErrors = false;

if (args.includes("--stdin")) {
  const text = readFileSync(0, "utf8");
  const tree = parser.parse(text);
  const errors = findErrors(tree.rootNode);
  if (errors.length > 0) {
    hasErrors = true;
    for (const e of errors) {
      console.log(`STDIN:${e.startRow}:${e.startCol}: parse error (${e.type}) through ${e.endRow}:${e.endCol}`);
    }
  }
} else {
  for (const file of args) {
    const text = readFileSync(file, "utf8");
    const tree = parser.parse(text);
    const errors = findErrors(tree.rootNode);
    if (errors.length > 0) {
      hasErrors = true;
      for (const e of errors) {
        console.log(`${file}:${e.startRow}:${e.startCol}: parse error (${e.type}) through ${e.endRow}:${e.endCol}`);
      }
    }
  }
}

process.exit(hasErrors ? 1 : 0);
