const DEFAULT_BRANCH = 'main';
const MAX_FILE_BYTES = 180_000;
const MAX_RANGE_SOURCE_BYTES = 1_000_000;
const MAX_READ_LINES = 200;
function readRange(options = {}) {
  if (options.start_line == null && options.end_line == null) return null;
  const start = options.start_line ?? 1;
  const end = options.end_line ?? (start + 99);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start + 1 > MAX_READ_LINES) {
    throw Object.assign(new Error('CODE_READ_RANGE_INVALID'), { code:'CODE_READ_RANGE_INVALID' });
  }
  return {start, end};
}
async function boundedText(response, limit) {
  if (!response.body?.getReader) {
    const value = await response.text();
    if (new TextEncoder().encode(value).length > limit) throw Object.assign(new Error('CODE_FILE_TOO_LARGE'), {code:'CODE_FILE_TOO_LARGE'});
    return value;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, value = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw Object.assign(new Error('CODE_FILE_TOO_LARGE'), {code:'CODE_FILE_TOO_LARGE'}); }
      value += decoder.decode(next.value, {stream:true});
    }
    return value + decoder.decode();
  } finally { reader.releaseLock(); }
}
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
function ensureTextSize(content, limit = MAX_FILE_BYTES) {
  const bytes = new TextEncoder().encode(String(content || '')).length;
  if (bytes > limit) throw Object.assign(new Error('CODE_FILE_TOO_LARGE'), { code: 'CODE_FILE_TOO_LARGE' });
  if (String(content || '').includes('\u0000')) throw Object.assign(new Error('CODE_BINARY_DENIED'), { code: 'CODE_BINARY_DENIED' });
  return String(content || '');
}

export function createGitHubCodeReader({ repository, branch = DEFAULT_BRANCH, token = '', pinnedSha = '', fetchImpl = fetch } = {}) {
  const repo = text(repository, 'repository', 200);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw Object.assign(new Error('INVALID_REPOSITORY'), { code: 'INVALID_REPOSITORY' });
  const ref = text(branch, 'branch', 200);
  const validSha = value => /^[0-9a-f]{40}$/i.test(String(value || '').trim());
  const requestedPin = String(pinnedSha || '').trim();
  if (requestedPin && !validSha(requestedPin)) {
    throw Object.assign(new Error('CODE_HEAD_PIN_INVALID'), { code: 'CODE_HEAD_PIN_INVALID' });
  }
  const pinned = requestedPin ? requestedPin.toLowerCase() : '';
  const contentRef = pinned || ref;
  const api = path => `https://api.github.com/repos/${repo}/${path}`;

  function selectedRead(path, content, sha, range) {
    if (!range) return {path, content:ensureTextSize(content), sha, branch:ref, repository:repo};
    const source = ensureTextSize(content, MAX_RANGE_SOURCE_BYTES);
    const lines = source.split(/\r?\n/);
    if (range.start > lines.length) throw Object.assign(new Error('CODE_READ_RANGE_EMPTY'), {code:'CODE_READ_RANGE_EMPTY'});
    const end = Math.min(range.end, lines.length);
    const selected = ensureTextSize(lines.slice(range.start - 1, end).join('\n'));
    return {path, content:selected, sha, branch:ref, repository:repo, start_line:range.start, end_line:end, total_lines:lines.length, partial:range.start > 1 || end < lines.length, source_ref:contentRef};
  }
  async function readRaw(path, range) {
    const response = await fetchImpl(rawUrl(repo, contentRef, path), { headers: { 'user-agent': 'meliturgos-code-reader' } });
    if (!response.ok) throw githubError(response, 'CODE_READ_FAILED');
    const content = await boundedText(response, range ? MAX_RANGE_SOURCE_BYTES : MAX_FILE_BYTES);
    return selectedRead(path, content, response.headers?.get?.('etag') || '', range);
  }

  async function read(pathValue, options = {}) {
    const path = safePath(pathValue), range = readRange(options);
    const limit = range ? MAX_RANGE_SOURCE_BYTES : MAX_FILE_BYTES;
    let response;
    try {
      response = await fetchImpl(`${api(`contents/${path}`)}?ref=${encodeURIComponent(contentRef)}`, { headers: headers(token) });
    } catch {
      return readRaw(path, range);
    }
    if (!response.ok) {
      if (response.status === 404) throw githubError(response, 'CODE_READ_FAILED');
      return readRaw(path, range);
    }
    const body = JSON.parse(await boundedText(response, limit * 2 + 4096));
    if (body.type && body.type !== 'file') throw Object.assign(new Error('CODE_NOT_A_FILE'), { code: 'CODE_NOT_A_FILE' });
    if (Number(body.size || 0) > limit) throw Object.assign(new Error('CODE_FILE_TOO_LARGE'), { code: 'CODE_FILE_TOO_LARGE' });
    const content = ensureTextSize(decodeBase64(body.content || ''), limit);
    return selectedRead(path, content, String(body.sha || ''), range);
  }

  async function tree() {
    try {
      const response = await fetchImpl(`${api(`git/trees/${encodeURIComponent(contentRef)}`)}?recursive=1`, { headers: headers(token) });
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
    const checked = (sha, source) => {
      const normalized = String(sha || '').trim().toLowerCase();
      if (!validSha(normalized)) throw Object.assign(new Error('CODE_HEAD_SHA_INVALID'), { code: 'CODE_HEAD_SHA_INVALID' });
      if (pinned && normalized !== pinned) {
        const error = new Error('CODE_HEAD_PIN_MISMATCH');
        error.code = 'CODE_HEAD_PIN_MISMATCH';
        error.expected_sha = pinned;
        error.observed_sha = normalized;
        throw error;
      }
      return {
        sha: pinned || normalized,
        branch: ref,
        repository: repo,
        source,
        remote_verified: true,
        pinned: Boolean(pinned),
      };
    };

    // Prefer the canonical branch ref as a freshness check. When a build SHA is
    // pinned, all source reads use that immutable commit. A reachable remote
    // branch must still agree with the pin; disagreement fails closed.
    const refResponse = await request('git/ref/heads/' + ref.split('/').map(encodeURIComponent).join('/'));
    if (refResponse?.ok) {
      const body = await refResponse.json();
      return checked(body?.object?.sha, 'github-ref');
    }

    const commitResponse = await request('commits/' + encodeURIComponent(ref));
    if (commitResponse?.ok) {
      const body = await commitResponse.json();
      return checked(body?.sha, 'github-commit');
    }

    const listResponse = await request('commits?sha=' + encodeURIComponent(ref) + '&per_page=1');
    if (listResponse?.ok) {
      const listBody = await listResponse.json();
      return checked(Array.isArray(listBody) ? listBody[0]?.sha : '', 'github-commit-list');
    }

    // No token in production: Cloudflare's shared egress IPs exhaust GitHub's
    // anonymous REST quota (60/h), which stalled every self-development job on
    // CODE_HEAD_READ_FAILED. Git's smart-HTTP ref advertisement has no such
    // quota and is the same source of truth for a public repository.
    if (!/^[0-9a-f]{40}$/i.test(ref)) {
      try {
        const adv = await fetchImpl(`https://github.com/${repo}.git/info/refs?service=git-upload-pack`, { headers: { 'user-agent': 'git/2.45 meliturgos-code-reader' } });
        if (adv?.ok) {
          const body = await adv.text();
          const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = body.match(new RegExp('([0-9a-f]{40}) refs/heads/' + escaped + '(?:\\u0000|\\n|$)'));
          if (match) return checked(match[1], 'git-smart-http');
        }
      } catch {}
    }

    // The Worker preview is itself immutable evidence of the exact candidate
    // commit deployed by CI. If GitHub REST is temporarily unavailable/rate
    // limited, continue inspecting that exact snapshot instead of inventing a
    // head. Freshness is rechecked whenever the remote endpoint becomes usable.
    if (pinned) {
      return {
        sha: pinned,
        branch: ref,
        repository: repo,
        source: 'deployed-build-sha',
        remote_verified: false,
        pinned: true,
      };
    }

    throw githubError(listResponse || commitResponse || refResponse || { status: 0 }, 'CODE_HEAD_READ_FAILED');
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
  return { read, search, head, health, repository: repo, branch: ref, content_ref: contentRef, pinned_sha: pinned || null };
}

export function registerGitHubCodeCapabilities(bus, options = {}) {
  const reader = createGitHubCodeReader(options);
  bus.discover({ id: 'code.read', name: 'GitHub code read', category: 'development', version: '1.2.0', provider: 'github', description: 'Read non-secret MEL source; optional 1-based start_line/end_line selects up to 200 lines from a large file. Partial reads do not prove inspection of the whole file.', input_schema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 }, start_line:{type:'integer',minimum:1}, end_line:{type:'integer',minimum:1} }, required: ['path'], additionalProperties: false }, output_schema: { type: 'object', properties: { start_line:{type:'integer'}, end_line:{type:'integer'}, total_lines:{type:'integer'}, partial:{type:'boolean'}, source_ref:{type:'string'}, path: { type: 'string', minLength: 1, maxLength: 1000 }, content: { type: 'string', minLength: 0, maxLength: MAX_FILE_BYTES }, sha: { type: 'string', minLength: 0, maxLength: 300 }, branch: { type: 'string', minLength: 1, maxLength: 200 }, repository: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['path','content','sha','branch','repository'], additionalProperties: false }, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true }, input => reader.read(input.path, input), () => reader.health());
  bus.discover({ id: 'code.search', name: 'GitHub code search', category: 'development', version: '1.1.1', provider: 'github', description: 'Search bounded non-secret MELITURGOS source files in the configured GitHub branch.', input_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 }, path: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['query'], additionalProperties: false }, output_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 }, path: { type: 'string', minLength: 0, maxLength: 1000 }, matches: { type: 'array', items: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 }, line: { type: 'integer' }, excerpt: { type: 'string', minLength: 0, maxLength: 500 } }, required: ['path','line','excerpt'], additionalProperties: false } }, searched_files: { type: 'integer' }, branch: { type: 'string', minLength: 1, maxLength: 200 }, repository: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['query','path','matches','searched_files','branch','repository'], additionalProperties: false }, risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true }, input => reader.search(input), () => reader.health());
  return reader;
}
