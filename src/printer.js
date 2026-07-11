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
      return nodeText(node, text);
    case "comment":
      return nodeText(node, text);
    case "declaration":
      return printDeclaration(node, text, options);
    case "assignment":
      return printAssignment(node, text, options);
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
 * Group a node's named children into logical statements.
 *
 * A run of consecutive siblings where the next sibling starts on (or before)
 * the row the current one ends on indicates the parser split a single logical
 * source line into multiple statement nodes (a mis-parse, e.g. a method chain
 * with a trailing closure in a deeply-nested command-syntax context). Such a
 * run is emitted verbatim from source to avoid mangling it — preserving valid,
 * correctly-indented code rather than reformatting a wrong AST. For normal
 * code (one statement per line) every group is a single node, so this is a
 * no-op.
 */
function groupStatements(children) {
  const groups = [];
  let i = 0;
  while (i < children.length) {
    let j = i;
    while (
      j + 1 < children.length &&
      children[j + 1].startPosition.row <= children[j].endPosition.row
    ) {
      j++;
    }
    groups.push({ start: i, end: j });
    i = j + 1;
  }
  return groups;
}

/**
 * Print one logical-statement group: a single node via printNode, or a
 * multi-node (mis-split) run as a verbatim source slice.
 */
function printStatementGroup(group, children, text, options) {
  if (group.end === group.start) {
    return printNode(children[group.start], text, options);
  }
  const startNode = children[group.start];
  const endNode = children[group.end];
  return text.slice(startNode.startIndex, endNode.endIndex);
}

/**
 * Print the source file (root node).
 */
function printSourceFile(node, text, options) {
  const children = node.namedChildren;
  const groups = groupStatements(children);
  const parts = [];
  for (let g = 0; g < groups.length; g++) {
    parts.push(printStatementGroup(groups[g], children, text, options));
    if (g < groups.length - 1) {
      parts.push(hardline);
      // Preserve a single blank line where the original source had one or more.
      const prevRow = children[groups[g].end].endPosition.row;
      const nextRow = children[groups[g + 1].start].startPosition.row;
      if (nextRow - prevRow > 1) parts.push(hardline);
    }
  }
  parts.push(hardline);
  return parts;
}

/**
 * Print a variable declaration: `def slack_channel = '#prdfam-ad-ci'`
 */
function printDeclaration(node, text, options) {
  const value = node.childForFieldName("value");
  if (value) {
    // Preserve the exact prefix (modifiers + type/def + name + '=') from
    // source — do NOT assume `def`, which would drop an explicit type like
    // `String x = ...`. Only the value is reformatted.
    const prefix = text.slice(node.startIndex, value.startIndex);
    return [prefix, printNode(value, text, options)];
  }
  return nodeText(node, text);
}

/**
 * Print an assignment: `output = terraform(...)`, `X += 1`.
 * Preserves the exact LHS + operator prefix from source and reformats only
 * the right-hand side, so an assignment-RHS DSL call (e.g. `x = terraform(...)`)
 * still gets its arguments expanded. Increment/decrement forms (`i++`) have no
 * separate RHS and are printed verbatim.
 */
function printAssignment(node, text, options) {
  const named = node.namedChildren;
  if (named.length < 2) {
    // increment_op form (i++, --i) or anything unexpected: preserve source.
    return nodeText(node, text);
  }
  const rhs = named[named.length - 1];
  const prefix = text.slice(node.startIndex, rhs.startIndex).trimEnd();
  return [prefix, " ", printNode(rhs, text, options)];
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
  let statements = node.namedChildren;

  // Extract closure parameters: `{ a, b -> ... }`. The parameter_list is the
  // first named child when present; the `->` token is not a named node.
  let paramPrefix = null;
  if (statements.length > 0 && statements[0].type === "parameter_list") {
    const params = statements[0].namedChildren.map((p) => nodeText(p, text));
    paramPrefix = params.join(", ");
    statements = statements.slice(1);
  }

  const open = paramPrefix !== null ? ["{ ", paramPrefix, " ->"] : ["{"];

  if (statements.length === 0) {
    return paramPrefix !== null ? ["{ ", paramPrefix, " -> }"] : "{}";
  }

  // Single short statement: try inline (unless forceBlock)
  if (!forceBlock && statements.length === 1) {
    const inner = printNode(statements[0], text, options);
    const innerText = nodeText(statements[0], text);
    // If it's short and has no newlines, allow inline
    if (innerText.length < 60 && !innerText.includes("\n")) {
      return group([...open, indent([line, inner]), line, "}"]);
    }
  }

  // Check for inline comments (comment on same line as preceding statement)
  // Group them with the preceding statement instead of putting on a new line.
  // Also merge mis-split same-line sibling runs into verbatim source.
  const parts = [];
  const groups = groupStatements(statements);
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    parts.push(hardline);
    // Preserve a single blank line where the original source had one or more
    // between this statement and the previous one.
    if (g > 0) {
      const prevRow = statements[groups[g - 1].end].endPosition.row;
      const curRow = statements[group.start].startPosition.row;
      if (curRow - prevRow > 1) parts.push(hardline);
    }
    parts.push(printStatementGroup(group, statements, text, options));

    // Check if the next group is a single comment on the same line
    if (group.end === group.start && g + 1 < groups.length) {
      const nextGroup = groups[g + 1];
      const stmt = statements[group.end];
      const next = statements[nextGroup.start];
      if (
        nextGroup.end === nextGroup.start &&
        next.type === "comment" &&
        next.startPosition.row === stmt.endPosition.row
      ) {
        parts.push(" ");
        parts.push(printNode(next, text, options));
        g++; // skip the comment group
      }
    }
  }
  return [...open, indent(parts), hardline, "}"];
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
  const forceBlock = forcesBlockClosure(fnName);

  // The args is an argument_list that contains either:
  // 1. A single closure (most DSL blocks): `stages { ... }`
  // 2. A string + closure: `stage('name') { ... }` — though this is actually function_call
  // 3. Other patterns

  const argChildren = args.namedChildren;

  if (argChildren.length === 1 && argChildren[0].type === "closure") {
    return [fnName, " ", printClosure(argChildren[0], text, options, forceBlock)];
  }

  // Multiple args in juxt call (e.g., writeFile file: 'x', text: y)
  const mapItems = argChildren.filter((c) => c.type === "map_item");
  if (mapItems.length > 0) {
    const printedItems = mapItems.map((item) => printMapItem(item, text, options));
    return [fnName, " ", join(", ", printedItems)];
  }

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
  return [
    fnName,
    printArgumentList(args, text, options, alwaysExpandArgs(fnName), forcesBlockClosure(fnName)),
  ];
}

/**
 * terraform and ansible DSL steps (the terraform*, ansible*, tofu* family)
 * always expand their named arguments to one per line (with a trailing comma)
 * when they have any parameters, rather than collapsing to a single line.
 */
function alwaysExpandArgs(fnName) {
  return /^(terraform|ansible|tofu)/i.test(fnName.trim());
}

/**
 * Function/DSL-block names whose trailing closure is always kept as a
 * multi-line block (never collapsed to a single line), regardless of whether
 * the call uses parens (`dir("x") { ... }`) or juxtaposition (`always { ... }`).
 */
const BLOCK_CLOSURE_FNS = new Set([
  "agent", "options", "triggers", "stages", "steps", "post",
  "environment", "parameters", "when", "parallel", "script",
  "dir", "expression", "always", "anyOf", "stage", "container", "not",
]);
function forcesBlockClosure(fnName) {
  return BLOCK_CLOSURE_FNS.has(fnName.trim());
}

/**
 * Print an argument list `(...)`.
 *
 * Key logic:
 * - If all args are map_items: multi-line with one per line, trailing commas
 * - If args include a trailing closure: `('name') { ... }` pattern
 * - Otherwise: try to fit on one line
 */
function printArgumentList(node, text, options, alwaysExpand = false, forceBlock = false) {
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
    const closurePart = printClosure(lastChild, text, options, forceBlock);
    return ["(", join(", ", printedBefore), ") ", closurePart];
  }

  if (hasTrailingClosure && children.length === 1) {
    // Only child is a closure. Distinguish a trailing closure `foo() { }`
    // (closure after the `)`) from a closure passed as an argument `foo({ })`
    // (closure before the `)`), preserving the original parens either way.
    const closure = lastChild;
    const argText = nodeText(node, text);
    const closeParen = argText.indexOf(")");
    const closureRel = closure.startIndex - node.startIndex;
    if (closeParen !== -1 && closeParen < closureRel) {
      // Trailing closure with (possibly empty) parens: `foo() { }`
      return ["() ", printClosure(closure, text, options)];
    }
    // Closure is an argument inside the parens: `foo({ })`
    return ["(", printClosure(closure, text, options), ")"];
  }

  if (hasMapItems) {
    // Print ALL non-closure args (positional args mixed with named args must
    // not be dropped).
    const printedItems = children
      .filter((c) => c.type !== "closure")
      .map((c) => printNode(c, text, options));
    if (alwaysExpand) {
      // terraform/ansible family: always one arg per line with trailing comma.
      return [
        "(",
        indent([hardline, join([",", hardline], printedItems), ","]),
        hardline,
        ")",
      ];
    }
    // Otherwise: inline when it fits, else break to one arg per line.
    return group([
      "(",
      indent([softline, join([",", line], printedItems), ifBreak(",")]),
      softline,
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
