// Resolve changed local imports against GitHub's immutable candidate tree.
// The diff alone cannot establish that an unchanged dependency is absent.
export function changedLocalImports(diff) {
  let file = null;
  const paths = new Set();
  for (const line of String(diff || '').split('\n')) {
    const header = /^diff --git a\/.+ b\/(.+)$/.exec(line);
    if (header) { file = header[1]; continue; }
    if (!file || !line.startsWith('+') || line.startsWith('+++')) continue;
    const match = /^\+\s*(?:import|export)\b.*?\bfrom\s*['"](\.[^'"]+)['"]/.exec(line)
      || /^\+\s*import\s*['"](\.[^'"]+)['"]/.exec(line);
    if (!match) continue;
    const parts = file.split('/').slice(0, -1);
    let valid = true;
    for (const part of match[1].split('/')) {
      if (part === '..') { if (!parts.length) { valid = false; break; } parts.pop(); }
      else if (part && part !== '.') parts.push(part);
    }
    if (valid && parts.join('/').length <= 240 && !parts.includes('..') && parts.every(part => /^[A-Za-z0-9_.-]+$/.test(part))) paths.add(parts.join('/'));
  }
  if (paths.size > 40) throw Object.assign(new Error('COUNCIL_IMPORT_CONTEXT_TOO_LARGE'), { code:'COUNCIL_IMPORT_CONTEXT_TOO_LARGE' });
  return [...paths].sort();
}

export async function resolveCouncilImportContext(env, { head, diff, fetchImpl = fetch } = {}) {
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  if (!/^[a-f0-9]{40}$/.test(String(head))) fail('COUNCIL_IMPORT_HEAD_INVALID');
  const paths = changedLocalImports(diff);
  const proof = { schema:'mel.council-import-context/v1', head, source:'github-immutable-tree', scope:'added-single-line-static-local-imports', imports:[] };
  if (!paths.length) return proof;
  const repository = String(env?.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('COUNCIL_IMPORT_REPOSITORY_INVALID');
  const url = `https://api.github.com/repos/${repository}/git/trees/${head}?recursive=1`;
  const request = token => fetchImpl(url, { redirect:'manual', signal:AbortSignal.timeout(15_000), headers:{
    accept:'application/vnd.github+json', 'user-agent':'mel-council-import-context',
    ...(token ? { authorization:`Bearer ${token}` } : {}),
  } });
  let response = await request(env?.MEL_GITHUB_TOKEN);
  if (env?.MEL_GITHUB_TOKEN && [401,403].includes(response.status)) response = await request(null);
  if (!response.ok) fail('COUNCIL_IMPORT_CONTEXT_UNAVAILABLE');
  const tree = await response.json();
  if (!Array.isArray(tree?.tree) || tree.truncated !== false) fail('COUNCIL_IMPORT_TREE_INCOMPLETE');
  for (const path of paths) {
    const file = tree.tree.find(row => row.path === path && row.type === 'blob' && /^[a-f0-9]{40}$/.test(row.sha || ''));
    proof.imports.push({ path, status:file ? 'EXISTS_AT_EXACT_SHA' : 'NOT_FOUND_IN_COMPLETE_TREE', blob_sha:file?.sha || null });
  }
  return proof;
}
