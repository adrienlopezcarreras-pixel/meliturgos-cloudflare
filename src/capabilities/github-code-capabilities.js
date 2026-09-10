const DEFAULT_BRANCH = 'release/mel-2026-09-10-r3';
const MAX_FILE_BYTES = 180_000;
const MAX_SEARCH_FILES = 24;
const MAX_MATCHES = 20;
const DENIED_PATH = /(^|\/)(?:\.env(?:\.|$)|\.dev\.vars(?:$|\/)|\.wrangler(?:$|\/)|backups?(?:$|\/)|node_modules(?:$|\/)|\.git(?:$|\/)|secrets?(?:$|\/)|credentials?(?:$|\/)|tokens?(?:$|\/))/i;
const TEXT_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|txt|yml|yaml|toml|css|html|sql|sh|ps1)$/i;
const FALLBACK_FILES = [
  'src/index.js','src/router.js','src/api/native-chat.js','src/capabilities/default-bus.js',
  'src/capabilities/github-code-capabilities.js','src/core/orchestrator/gen2-runtime.js',
  'src/core/orchestrator/context-builder.js','src/pages/mvp-interface.js','src/pages/full-interface-v2.js',
  'wrangler.jsonc','package.json','README.md'
];

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
function rawUrl(repo, ref, path) {
  const enc = value => String(value).split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${enc(repo)}/${enc(ref)}/${enc(path)}`;
}
function ensureTextSize(content) {
  const bytes = new TextEncoder().encode(String(content || '')).length;
  if (bytes > MAX_FILE_BYTES) throw Object.assign(new Error('CODE_FILE_TOO_LARGE'), { code: 'CODE_FILE_TOO_LARGE' });
  if (String(content || '').includes('\u0000')) throw Object.assign(new Error('CODE_BINARY_DENIED'), { code: 'CODE_BINARY_DENIED' });
  return String(content || '');
}

export function createGitHubCodeReader({ repository, branch = DEFAULT_BRANCH, token = '', fetchImpl = fetch } = {}) {
  const repo = text(repository, 'repository', 200);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw Object.assign(new Error('INVALID_REPOSITORY'), { code: 'INVALID_REPOSITORY' });
  const ref = text(branch, 'branch', 200);
  const api = path => `https://api.github.com/repos/${repo}/${path}`;

  async function readRaw(path) {
    const response = await fetchImpl(rawUrl(repo, ref, path), { headers: { 'user-agent': 'meliturgos-code-reader' } });
    if (!response.ok) throw githubError(response, 'CODE_READ_FAILED');
    const content = ensureTextSize(await response.text());
    return { path, content, sha: response.headers?.get?.('etag') || '', branch: ref, repository: repo };
  }

  async function read(pathValue) {
    const path = safePath(pathValue);
    let response;
    try {
      response = await fetchImpl(`${api(`contents/${path}`)}?ref=${encodeURIComponent(ref)}`, { headers: headers(token) });
    } catch {
      return readRaw(path);
    }
    if (!response.ok) {
      if (response.status === 404) throw githubError(response, 'CODE_READ_FAILED');
      return readRaw(path);
    }
    const body = await response.json();
    if (body.type && body.type !== 'file') throw Object.assign(new Error('CODE_NOT_A_FILE'), { code: 'CODE_NOT_A_FILE' });
    if (Number(body.size || 0) > MAX_FILE_BYTES) throw Object.assign(new Error('CODE_FILE_TOO_LARGE'), { code: 'CODE_FILE_TOO_LARGE' });
    const content = ensureTextSize(decodeBase64(body.content || ''));
    return { path, content, sha: String(body.sha || ''), branch: ref, repository: repo };
  }

  async function tree() {
    try {
      const response = await fetchImpl(`${api(`git/trees/${encodeURIComponent(ref)}`)}?recursive=1`, { headers: headers(token) });
      if (response.ok) {
        const body = await response.json();
        return (Array.isArray(body.tree) ? body.tree : [])
          .filter(x => x && x.type === 'blob' && typeof x.path === 'string')
          .map(x => ({ path: x.path, size: Number(x.size || 0) }))
          .filter(x => x.size <= MAX_FILE_BYTES && !DENIED_PATH.test(x.path) && TEXT_EXT.test(x.path));
      }
    } catch {}
    return FALLBACK_FILES.map(path => ({ path, size: 0 })).filter(x => !DENIED_PATH.test(x.path));
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

  async function head() {
    const request = async path => {
      try { return await fetchImpl(api(path), { headers: headers(token) }); }
      catch { return null; }
    };

    // Prefer the Git ref endpoint because it handles slash-containing branch
    // names reliably in the Worker. Keep the historical commits lookup as a
    // compatibility fallback for restricted GitHub tokens and existing mocks.
    const refResponse = await request('git/ref/heads/' + ref.split('/').map(encodeURIComponent).join('/'));
    if (refResponse?.ok) {
      const body = await refResponse.json();
      const sha = String(body?.object?.sha || '').trim();
      if (!/^[0-9a-f]{40}$/i.test(sha)) throw Object.assign(new Error('CODE_HEAD_SHA_INVALID'), { code: 'CODE_HEAD_SHA_INVALID' });
      return { sha, branch: ref, repository: repo };
    }

    const commitResponse = await request('commits/' + encodeURIComponent(ref));
    if (!commitResponse?.ok) throw githubError(commitResponse || { status: 0 }, 'CODE_HEAD_READ_FAILED');
    const body = await commitResponse.json();
    const sha = String(body?.sha || '').trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw Object.assign(new Error('CODE_HEAD_SHA_INVALID'), { code: 'CODE_HEAD_SHA_INVALID' });
    return { sha, branch: ref, repository: repo };
  }

  async function health() {
    try {
      const response = await fetchImpl(api('git/ref/heads/' + ref.split('/').map(encodeURIComponent).join('/')), { headers: headers(token) });
      if (response.ok) return 'ONLINE';
      if (response.status === 401) return 'OFFLINE';
      // Any non-auth REST failure can still leave raw.githubusercontent.com
      // usable. Probe the same bounded public file used by the historical
      // compatibility path before reporting degraded health.
      try {
        const probe = await fetchImpl(rawUrl(repo, ref, 'package.json'), { headers: { 'user-agent': 'meliturgos-code-reader' } });
        return probe.ok ? 'ONLINE' : 'DEGRADED';
      } catch { return 'DEGRADED'; }
    } catch {
      try {
        const probe = await fetchImpl(rawUrl(repo, ref, 'package.json'), { headers: { 'user-agent': 'meliturgos-code-reader' } });
        return probe.ok ? 'ONLINE' : 'DEGRADED';
      } catch { return 'DEGRADED'; }
    }
  }
  return { read, search, head, health, repository: repo, branch: ref };
}

export function registerGitHubCodeCapabilities(bus, options = {}) {
  const reader = createGitHubCodeReader(options);
  bus.discover({ id: 'code.read', name: 'GitHub code read', category: 'development', version: '1.1.1', provider: 'github', description: 'Read one bounded non-secret text source file from the configured MELITURGOS repository branch.', input_schema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['path'], additionalProperties: false }, output_schema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 }, content: { type: 'string', minLength: 0, maxLength: MAX_FILE_BYTES }, sha: { type: 'string', minLength: 0, maxLength: 300 }, branch: { type: 'string', minLength: 1, maxLength: 200 }, repository: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['path','content','sha','branch','repository'], additionalProperties: false }, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true }, input => reader.read(input.path), () => reader.health());
  bus.discover({ id: 'code.search', name: 'GitHub code search', category: 'development', version: '1.1.1', provider: 'github', description: 'Search bounded non-secret MELITURGOS source files in the configured GitHub branch.', input_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 }, path: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['query'], additionalProperties: false }, output_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 }, path: { type: 'string', minLength: 0, maxLength: 1000 }, matches: { type: 'array', items: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 }, line: { type: 'integer' }, excerpt: { type: 'string', minLength: 0, maxLength: 500 } }, required: ['path','line','excerpt'], additionalProperties: false } }, searched_files: { type: 'integer' }, branch: { type: 'string', minLength: 1, maxLength: 200 }, repository: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['query','path','matches','searched_files','branch','repository'], additionalProperties: false }, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true }, input => reader.search(input), () => reader.health());
  return reader;
}
