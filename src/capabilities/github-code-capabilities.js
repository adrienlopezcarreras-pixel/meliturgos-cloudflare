const DEFAULT_BRANCH = 'mel-current';
const MAX_FILE_BYTES = 180_000;
const MAX_SEARCH_FILES = 24;
const MAX_MATCHES = 20;
const DENIED_PATH = /(^|\/)(?:\.env(?:\.|$)|\.dev\.vars(?:$|\/)|\.wrangler(?:$|\/)|backups?(?:$|\/)|node_modules(?:$|\/)|\.git(?:$|\/)|secrets?(?:$|\/)|credentials?(?:$|\/)|tokens?(?:$|\/))/i;
const TEXT_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|txt|yml|yaml|toml|css|html|sql|sh|ps1)$/i;

function text(value, name, max = 500) {
  const out = String(value ?? '').trim();
  if (!out) throw Object.assign(new Error(`${name.toUpperCase()}_REQUIRED`), { code: `${name.toUpperCase()}_REQUIRED` });
  if (out.length > max) throw Object.assign(new Error(`${name.toUpperCase()}_TOO_LONG`), { code: `${name.toUpperCase()}_TOO_LONG` });
  return out;
}
function safePath(value = '') {
  const path = text(value, 'path', 1000).replace(/^\.\//, '');
  if (path.startsWith('/') || path.includes('..') || path.includes('\\') || DENIED_PATH.test(path)) throw Object.assign(new Error('CODE_PATH_DENIED'), { code: 'CODE_PATH_DENIED' });
  return path;
}
function decodeBase64(value) {
  const raw = atob(String(value || '').replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(raw, c => c.charCodeAt(0)));
}
function headers(token) {
  const h = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'meliturgos-code-reader' };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}
function githubError(response, code) { const error = new Error(`${code}_${response.status}`); error.code = code; error.status = response.status; return error; }

export function createGitHubCodeReader({ repository, branch = DEFAULT_BRANCH, token = '', fetchImpl = fetch } = {}) {
  const repo = text(repository, 'repository', 200);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw Object.assign(new Error('INVALID_REPOSITORY'), { code: 'INVALID_REPOSITORY' });
  const ref = text(branch, 'branch', 200);
  const api = path => `https://api.github.com/repos/${repo}/${path}`;

  async function read(pathValue) {
    const path = safePath(pathValue);
    const response = await fetchImpl(`${api(`contents/${path}`)}?ref=${encodeURIComponent(ref)}`, { headers: headers(token) });
    if (!response.ok) throw githubError(response, 'CODE_READ_FAILED');
    const body = await response.json();
    if (body.type && body.type !== 'file') throw Object.assign(new Error('CODE_NOT_A_FILE'), { code: 'CODE_NOT_A_FILE' });
    if (Number(body.size || 0) > MAX_FILE_BYTES) throw Object.assign(new Error('CODE_FILE_TOO_LARGE'), { code: 'CODE_FILE_TOO_LARGE' });
    const content = decodeBase64(body.content || '');
    if (content.includes('\u0000')) throw Object.assign(new Error('CODE_BINARY_DENIED'), { code: 'CODE_BINARY_DENIED' });
    return { path, content, sha: String(body.sha || ''), branch: ref, repository: repo };
  }

  async function tree() {
    const response = await fetchImpl(`${api(`git/trees/${encodeURIComponent(ref)}`)}?recursive=1`, { headers: headers(token) });
    if (!response.ok) throw githubError(response, 'CODE_TREE_FAILED');
    const body = await response.json();
    return (Array.isArray(body.tree) ? body.tree : [])
      .filter(x => x && x.type === 'blob' && typeof x.path === 'string')
      .map(x => ({ path: x.path, size: Number(x.size || 0) }))
      .filter(x => x.size <= MAX_FILE_BYTES && !DENIED_PATH.test(x.path) && TEXT_EXT.test(x.path));
  }

  async function search({ query, path = '' } = {}) {
    const needle = text(query, 'query', 300).toLowerCase();
    const prefix = path ? safePath(path) : '';
    const files = (await tree()).filter(x => !prefix || x.path === prefix || x.path.startsWith(`${prefix}/`));
    const pathHits = files.filter(x => x.path.toLowerCase().includes(needle));
    const selected = [...pathHits, ...files.filter(x => !pathHits.some(h => h.path === x.path))].slice(0, MAX_SEARCH_FILES);
    const matches = [];
    for (const file of selected) {
      if (matches.length >= MAX_MATCHES) break;
      let source;
      try { source = await read(file.path); } catch { continue; }
      const lines = source.content.split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
        if (!lines[i].toLowerCase().includes(needle)) continue;
        matches.push({ path: file.path, line: i + 1, excerpt: lines[i].trim().slice(0, 500) });
      }
    }
    return { query: String(query), path: prefix, matches, searched_files: selected.length, branch: ref, repository: repo };
  }

  async function health() {
    try {
      const response = await fetchImpl(api('commits/' + encodeURIComponent(ref)), { headers: headers(token) });
      if (response.ok) return 'ONLINE';
      if (response.status === 401 || response.status === 403) return 'OFFLINE';
      return 'DEGRADED';
    } catch { return 'DEGRADED'; }
  }
  return { read, search, health, repository: repo, branch: ref };
}

export function registerGitHubCodeCapabilities(bus, options = {}) {
  const reader = createGitHubCodeReader(options);
  bus.discover({ id: 'code.read', name: 'GitHub code read', category: 'development', version: '1.0.0', provider: 'github', description: 'Read one bounded non-secret text source file from the configured MELITURGOS repository branch.', input_schema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['path'], additionalProperties: false }, output_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, sha: { type: 'string' }, branch: { type: 'string' }, repository: { type: 'string' } }, required: ['path','content','sha','branch','repository'], additionalProperties: false }, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true }, input => reader.read(input.path), () => reader.health());
  bus.discover({ id: 'code.search', name: 'GitHub code search', category: 'development', version: '1.0.0', provider: 'github', description: 'Search bounded non-secret MELITURGOS source files in the configured GitHub branch.', input_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 }, path: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['query'], additionalProperties: false }, output_schema: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' }, matches: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, line: { type: 'integer' }, excerpt: { type: 'string' } }, required: ['path','line','excerpt'], additionalProperties: false } }, searched_files: { type: 'integer' }, branch: { type: 'string' }, repository: { type: 'string' } }, required: ['query','path','matches','searched_files','branch','repository'], additionalProperties: false }, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true }, input => reader.search(input), () => reader.health());
  return reader;
}
