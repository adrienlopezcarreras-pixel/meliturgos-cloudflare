import { parse } from 'acorn';

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

// Parse declarations rather than trusting model metadata, comments or strings.
// This is a conservative autonomous-edit contract, not a functional proof.
function contract(source) {
  let tree;
  try { tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch { fail('MENTOR_CODE_SYNTAX_INVALID'); }
  const names = new Set();
  const classes = new Map();
  function binding(node) {
    if (!node) return;
    if (node.type === 'Identifier') names.add(node.name);
    else if (node.type === 'ObjectPattern') node.properties.forEach(p => binding(p.value || p.argument));
    else if (node.type === 'ArrayPattern') node.elements.forEach(binding);
    else if (node.type === 'RestElement') binding(node.argument);
    else if (node.type === 'AssignmentPattern') binding(node.left);
  }
  for (const node of tree.body) {
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    if (node.type === 'ExportAllDeclaration') names.add(node.exported?.name || '*:' + node.source.value);
    if (node.type !== 'ExportNamedDeclaration') continue;
    for (const spec of node.specifiers || []) names.add(spec.exported.name || spec.exported.value);
    const decl = node.declaration;
    if (decl?.id) names.add(decl.id.name);
    for (const entry of decl?.declarations || []) binding(entry.id);
    if (decl?.type === 'ClassDeclaration') {
      classes.set(decl.id.name, new Set(decl.body.body
        .filter(item => !item.computed && item.key?.type !== 'PrivateIdentifier')
        .map(item => `${item.static ? 'static:' : ''}${item.kind || 'field'}:${item.key.name || item.key.value}`)));
    }
  }
  return { names, classes };
}

export function assertMentorCodeContract(path, before, after) {
  if (!/\.(?:js|mjs)$/.test(path)) return;
  const original = contract(before);
  const proposed = contract(after);
  if ([...original.names].some(name => !proposed.names.has(name))) fail('MENTOR_EXPORT_CONTRACT_REMOVED');
  for (const [name, methods] of original.classes) {
    if ([...methods].some(method => !proposed.classes.get(name)?.has(method))) fail('MENTOR_CLASS_CONTRACT_REMOVED');
  }
}
