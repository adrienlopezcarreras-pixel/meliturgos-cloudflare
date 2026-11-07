import { parse } from 'acorn';

// Syntax and interface facts from an immutable source file, never execution
// results or a substitute for the independent semantic code review.
export function councilSourceFacts(content) {
  let tree;
  try { tree = parse(content, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch { return { syntax_status: 'INVALID_MODULE', scope: 'STATIC_ONLY_NOT_EXECUTED' }; }
  const exports = new Set(), declarations = new Map(), imports = new Set(), tests = [];
  const bind = node => {
    if (!node) return;
    if (node.type === 'Identifier') declarations.set(node.name, (declarations.get(node.name) || 0) + 1);
    else if (node.type === 'ObjectPattern') for (const row of node.properties) bind(row.value || row.argument);
    else if (node.type === 'ArrayPattern') for (const row of node.elements) bind(row);
    else if (node.type === 'RestElement') bind(node.argument);
    else if (node.type === 'AssignmentPattern') bind(node.left);
  };
  for (const node of tree.body) {
    if (node.type === 'ImportDeclaration' || node.type.startsWith('Export') && node.source)
      imports.add(node.source.value);
    if (node.type === 'ExportDefaultDeclaration') exports.add('default');
    for (const spec of node.type === 'ExportNamedDeclaration' ? node.specifiers : []) exports.add(spec.exported.name || spec.exported.value);
    const decl = node.declaration || node;
    if (decl.id) { bind(decl.id); if (node.type === 'ExportNamedDeclaration') exports.add(decl.id.name); }
    for (const row of decl.declarations || []) {
      bind(row.id);
      if (node.type === 'ExportNamedDeclaration' && row.id.type === 'Identifier') exports.add(row.id.name);
    }
  }
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'test'
      && typeof node.arguments[0]?.value === 'string') tests.push(node.arguments[0].value.slice(0, 180));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) pending.push(child); }
      else if (value?.type) pending.push(value);
    }
  }
  return { syntax_status: 'VALID_MODULE', scope: 'STATIC_ONLY_NOT_EXECUTED',
    exports: [...exports].sort(), top_level_declarations: Object.fromEntries(declarations),
    local_imports: [...imports].filter(path => path.startsWith('.')).sort(),
    test_cases: tests.sort().slice(0, 12), test_case_count: tests.length };
}
