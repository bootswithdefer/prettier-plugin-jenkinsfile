import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Parser, Language } from "web-tree-sitter";
import { printGroovyNode } from "./printer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wasmPath = join(__dirname, "..", "tree-sitter-groovy.wasm");

let Groovy;
let parserInstance;

async function initParser() {
  if (Groovy) return;
  await Parser.init();
  parserInstance = new Parser();
  Groovy = await Language.load(wasmPath);
  parserInstance.setLanguage(Groovy);
}

function parse(text) {
  const tree = parserInstance.parse(text);
  return { tree, text };
}

export const languages = [
  {
    name: "groovy",
    parsers: ["groovy-parse"],
    extensions: [".groovy", ".gradle"],
    filenames: ["Jenkinsfile"],
    vscodeLanguageIds: ["groovy"],
  },
];

export const parsers = {
  "groovy-parse": {
    parse: async (text) => {
      await initParser();
      return parse(text);
    },
    astFormat: "groovy-ast",
    locStart: (node) => node.startIndex ?? 0,
    locEnd: (node) => node.endIndex ?? 0,
  },
};

export const printers = {
  "groovy-ast": {
    print: printGroovyNode,
  },
};
