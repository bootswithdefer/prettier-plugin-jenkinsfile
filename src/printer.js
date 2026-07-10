/**
 * Prettier printer for Groovy/Jenkinsfile AST (tree-sitter-groovy).
 *
 * Converts tree-sitter CST nodes into Prettier doc IR.
 * Focused on Jenkins Declarative Pipeline formatting patterns.
 */

const {
  doc: {
    builders: { group, indent, hardline, softline, line, join, ifBreak },
  },
} = await import("prettier");

/**
 * Main print function called by Prettier for each AST node.
 */
export function printGroovyNode(path, options, print) {
  const { tree, text } = path.getValue();

  // Top-level: walk the root
  if (tree && tree.rootNode) {
    return printNode(tree.rootNode, text, options);
  }

  // If called on a sub-node (shouldn't happen with our architecture)
  return text;
}

/**
 * Recursively print a tree-sitter node.
 */
function printNode(node, text, options) {
  // If this node IS a parse error, preserve its source text verbatim
  if (node.type === "ERROR") {
    return nodeText(node, text);
  }

  switch (node.type) {
    case "source_file":
      return printSourceFile(node, text, options);
    case "shebang":
      return [nodeText(node, text), hardline];
    case "comment":
      return nodeText(node, text);
    case "declaration":
      return printDeclaration(node, text, options);
    case "pipeline":
      return printPipeline(node, text, options);
    case "closure":
      return printClosure(node, text, options);
    case "juxt_function_call":
      return printJuxtFunctionCall(node, text, options);
    case "function_call":
      return printFunctionCall(node, text, options);
    case "argument_list":
      return printArgumentList(node, text, options);
    case "map_item":
      return printMapItem(node, text, options);
    case "string":
    case "number_literal":
    case "boolean_literal":
    case "null":
      return nodeText(node, text);
    case "identifier":
      return nodeText(node, text);
    case "label":
      return nodeText(node, text);
    default:
      // Fallback: print source text for unknown nodes
      return nodeText(node, text);
  }
}

/**
 * Print the source file (root node).
 */
function printSourceFile(node, text, options) {
  const parts = [];
  for (const child of node.namedChildren) {
    parts.push(printNode(child, text, options));
    parts.push(hardline);
  }
  return parts;
}

/**
 * Print a variable declaration: `def slack_channel = '#prdfam-ad-ci'`
 */
function printDeclaration(node, text, options) {
  const name = node.childForFieldName("name");
  const value = node.childForFieldName("value");
  if (name && value) {
    return ["def ", nodeText(name, text), " = ", printNode(value, text, options)];
  }
  return nodeText(node, text);
}

/**
 * Print `pipeline { ... }` — the top-level pipeline block.
 */
function printPipeline(node, text, options) {
  // pipeline has one child: a closure
  const closure = node.namedChildren.find((c) => c.type === "closure");
  if (closure) {
    return ["pipeline ", printClosure(closure, text, options)];
  }
  return nodeText(node, text);
}

/**
 * Print a closure `{ ... }`.
 * Handles both single-statement closures (inline) and multi-statement (block).
 *
 * @param {object} node - tree-sitter node
 * @param {string} text - source text
 * @param {object} options - prettier options
 * @param {boolean} forceBlock - force multi-line block format (for DSL blocks like agent, options)
 */
function printClosure(node, text, options, forceBlock = false) {
  const statements = node.namedChildren;

  if (statements.length === 0) {
    return "{}";
  }

  // Single short statement: try inline (unless forceBlock)
  if (!forceBlock && statements.length === 1) {
    const inner = printNode(statements[0], text, options);
    const innerText = nodeText(statements[0], text);
    // If it's short and has no newlines, allow inline
    if (innerText.length < 60 && !innerText.includes("\n")) {
      return group(["{", indent([line, inner]), line, "}"]);
    }
  }

  // Check for inline comments (comment on same line as preceding statement)
  // Group them with the preceding statement instead of putting on a new line
  const parts = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    parts.push(hardline);
    parts.push(printNode(stmt, text, options));

    // Check if the next sibling is a comment on the same line
    if (i + 1 < statements.length) {
      const next = statements[i + 1];
      if (next.type === "comment" && next.startPosition.row === stmt.endPosition.row) {
        // Inline comment: put on same line with a space
        parts.push(" ");
        parts.push(printNode(next, text, options));
        i++; // skip the comment in the next iteration
      }
    }
  }
  return ["{", indent(parts), hardline, "}"];
}

/**
 * Print a juxtaposition function call: `stages { ... }`, `agent { ... }`
 * These are DSL blocks where the function name is followed by args without parens.
 */
function printJuxtFunctionCall(node, text, options) {
  const fn = node.childForFieldName("function");
  const args = node.childForFieldName("args");

  if (!fn || !args) return nodeText(node, text);

  const fnName = nodeText(fn, text);

  // Pipeline DSL blocks that should always be multi-line
  const blockKeywords = new Set([
    "agent", "options", "triggers", "stages", "steps", "post",
    "environment", "parameters", "when", "parallel", "script",
  ]);
  const forceBlock = blockKeywords.has(fnName);

  // The args is an argument_list that contains either:
  // 1. A single closure (most DSL blocks): `stages { ... }`
  // 2. A string + closure: `stage('name') { ... }` — though this is actually function_call
  // 3. Other patterns

  const argChildren = args.namedChildren;

  if (argChildren.length === 1 && argChildren[0].type === "closure") {
    return [fnName, " ", printClosure(argChildren[0], text, options, forceBlock)];
  }

  // Multiple args in juxt call (rare)
  const printedArgs = argChildren.map((c) => printNode(c, text, options));
  return [fnName, " ", ...printedArgs];
}

/**
 * Print a regular function call: `terraform(...)`, `stage('name') { }`
 */
function printFunctionCall(node, text, options) {
  const fn = node.childForFieldName("function");
  const args = node.childForFieldName("args");

  if (!fn || !args) return nodeText(node, text);

  const fnName = nodeText(fn, text);
  return [fnName, printArgumentList(args, text, options)];
}

/**
 * Print an argument list `(...)`.
 *
 * Key logic:
 * - If all args are map_items: multi-line with one per line, trailing commas
 * - If args include a trailing closure: `('name') { ... }` pattern
 * - Otherwise: try to fit on one line
 */
function printArgumentList(node, text, options) {
  const children = node.namedChildren;

  if (children.length === 0) {
    return "()";
  }

  // Check if last child is a closure (trailing closure pattern like `stage('name') { }`)
  const lastChild = children[children.length - 1];
  const hasTrailingClosure = lastChild.type === "closure";

  // Check if we have map_items (named args)
  const mapItems = children.filter((c) => c.type === "map_item");
  const hasMapItems = mapItems.length > 0;

  if (hasTrailingClosure && children.length >= 2) {
    // Pattern: function('arg1', 'arg2') { ... }
    const beforeClosure = children.slice(0, -1);
    const printedBefore = beforeClosure.map((c) => printNode(c, text, options));
    const closurePart = printClosure(lastChild, text, options);
    return ["(", join(", ", printedBefore), ") ", closurePart];
  }

  if (hasTrailingClosure && children.length === 1) {
    // Pattern: function { ... } — closure is only arg
    return [" ", printClosure(lastChild, text, options)];
  }

  if (hasMapItems) {
    // Multi-line named arguments: one per line, trailing comma
    const printedItems = mapItems.map((item) => printMapItem(item, text, options));
    return group([
      "(",
      indent([hardline, join(["," , hardline], printedItems), ","]),
      hardline,
      ")",
    ]);
  }

  // Simple args: try inline
  const printedArgs = children.map((c) => printNode(c, text, options));
  return group(["(", join(", ", printedArgs), ")"]);
}

/**
 * Print a map item: `key: value`
 */
function printMapItem(node, text, options) {
  const key = node.childForFieldName("key");
  const value = node.childForFieldName("value");

  if (!key || !value) return nodeText(node, text);

  const keyStr = nodeText(key, text);
  const valuePart = printNode(value, text, options);

  return [keyStr, ": ", valuePart];
}

/**
 * Get the raw source text for a node.
 */
function nodeText(node, text) {
  return text.slice(node.startIndex, node.endIndex);
}
