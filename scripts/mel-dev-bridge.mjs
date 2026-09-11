import http from 'node:http';
import path from 'node:path';
import dns from 'node:dns';
import { LocalDevBridge } from '../src/dev/dev-bridge.js';
import { DevJobService } from '../src/dev/dev-job-service.js';
import { parseSearchPaths, rankSearchPaths } from '../src/dev/search-paths.js';

// WSL/Windows hosts can resolve AAAA first even when IPv6 egress is unusable.
// Prefer IPv4 without disabling IPv6 entirely; this matches the working curl path
// and avoids intermittent native fetch "fetch failed" loops.
try { dns.setDefaultResultOrder(process.env.MEL_DEV_DNS_ORDER || 'ipv4first'); } catch {}

function transportMessage(error) {
  const cause = error?.cause;
  const code = cause?.code || error?.code;
  const detail = cause?.message || error?.message || 'fetch failed';
  return code ? `${detail} (${code})` : detail;
}

export class RemoteWorkerClient {
  constructor({ workerUrl = process.env.MEL_DEV_WORKER_URL || 'https://meliturgos.adrien-lopezcarreras.workers.dev', token = process.env.MEL_DEV_BRIDGE_TOKEN, fetchImpl = fetch } = {}) {
    if (!token) throw new Error('MEL_DEV_BRIDGE_TOKEN is required');
    this.base = workerUrl.replace(/\/$/, ''); this.token = token; this.fetch = fetchImpl;
    this.timeoutMs = Math.max(1000, Number(process.env.MEL_DEV_BRIDGE_FETCH_TIMEOUT_MS || 10000));
    this.maxAttempts = Math.max(1, Math.min(5, Number(process.env.MEL_DEV_BRIDGE_FETCH_ATTEMPTS || 3)));
  }
  async request(path, body = {}) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetch(`${this.base}${path}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(data.error || `HTTP_${response.status}`); error.status = response.status; throw error; }
        return data;
      } catch (error) {
        // HTTP errors are deterministic and must not be retried/spammed.
        if (error?.status) throw error;
        lastError = error;
        if (attempt < this.maxAttempts) await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    const wrapped = new Error(transportMessage(lastError));
    wrapped.code = lastError?.cause?.code || lastError?.code || 'REMOTE_FETCH_FAILED';
    throw wrapped;
  }
  heartbeat() { return this.request('/api/dev-bridge/heartbeat', { status: 'ONLINE' }); }
  claim() { return this.request('/api/dev-bridge/claim'); }
  result(payload) { return this.request('/api/dev-bridge/result', payload); }
}

export { parseSearchPaths, rankSearchPaths } from '../src/dev/search-paths.js';

const token = process.env.MEL_DEV_BRIDGE_TOKEN;
if (!token) throw new Error('MEL_DEV_BRIDGE_TOKEN is required');
const bridge = new LocalDevBridge({ repoRoot: process.cwd() });
const jobs = new DevJobService();
const remote = new RemoteWorkerClient({ token });
let stopped = false;
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

async function processRemoteJob(job) {
  const id = job.job_id || job.id;
  const context = { owner: 'dev-bridge', requestId: id };
  try {
    const steps = [];
    const query = /interface|fichier|chemin|principal/i.test(job.goal || '') ? 'interface' : String(job.goal || '').slice(0, 120);
    await bridge.bus.execute('dev.create_candidate', { job_id: id }, context);
    const search = await bridge.bus.execute('code.search', { query, job_id: id }, context);
    steps.push({ capability: 'code.search', query, result: search });
    const text = search?.result?.stdout || search?.stdout || '';
    const paths = parseSearchPaths(text);
    const ranked = rankSearchPaths(paths); const inspected = [];
    const inspect = async (candidate) => { if (!candidate || inspected.some(x => x.path === candidate)) return; try { const read = await bridge.bus.execute('code.read', { path: candidate, job_id: id }, context); inspected.push({ path: candidate, result: read }); steps.push({ capability: 'code.read', path: candidate, result: read }); } catch {} };
    for (const candidate of ranked.slice(0, 5)) await inspect(candidate);
    for (let depth = 0; depth < 2; depth++) {
      const current = inspected.slice();
      for (const item of current) for (const target of resolveLocalImports(item.path, item.result?.content || '')) {
        if (/^(src\/dev|src\/teachers|tests|imports|docs|migrations)\//.test(target) && !/ui|page|view|render|template|interface|mvp|main|app|home|professor/i.test(target)) continue;
        await inspect(target);
      }
    }
    const candidatePath = goalAwareSelect(job.goal, inspected);
    const files = typeof job.files_json === 'string' ? JSON.parse(job.files_json || '[]') : (job.files_json || []);
    for (const file of Array.isArray(files) ? files : []) if (file?.path && typeof file.content === 'string') await bridge.bus.execute('dev.apply_change', { job_id: id, path: file.path, content: file.content }, context);
    const tests = typeof job.tests_json === 'string' ? JSON.parse(job.tests_json || '[]') : (job.tests_json || []);
    const testResult = Array.isArray(tests) && tests[0]?.command ? await bridge.bus.execute('dev.test', { job_id: id, command: tests[0].command }, context) : { command: 'read-only', passed: true };
    steps.push({ capability: 'dev.test', result: testResult });
    const diff = await bridge.bus.execute('code.diff', { job_id: id }, context);
    const report = await bridge.bus.execute('dev.report', { job_id: id }, context);
    steps.push({ capability: 'code.diff', result: diff });
    const answer = candidatePath || (paths[0] || 'Aucun fichier trouvé');
    const inspectedFiles = inspected.map(x => x.path);
    const result = { answer, steps, files: inspectedFiles, tests: [testResult], diff_summary: 'NO_CHANGES' };
    return remote.result({ job_id: id, status: 'READY_FOR_REVIEW', candidate_branch: report.branch, files_json: inspectedFiles, tests_json: [testResult], diff_summary: 'NO_CHANGES', result_json: result, plan_json: { steps: steps.map(s => s.capability) } });
  } catch (error) { return remote.result({ job_id: id, status: 'FAILED', error: error.code || error.message }); }
}

function relevance(file, content = '') { const p = String(file).toLowerCase(), c = String(content).toLowerCase(); let n = 0; if (p.startsWith('src/')) n += 20; if (/(interface|page|ui|component|route)/.test(p)) n += 15; if (/(<main|add eventlistener|fetch\(|export|<!doctype html)/.test(c)) n += 20; if (/^(imports|exports|docs|tests)\//.test(p)) n -= 40; if (/\.json$/.test(p)) n -= 20; return n; }
function resolveLocalImports(file, content) { const out = []; const re = /(?:import\s+(?:[^'";]+?\s+from\s+)?|require\s*\(|import\s*\()(['"])(\.[^'" ]+)\1/g; let m; while ((m = re.exec(content))) { const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[2])); for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.ts`, `${base}.tsx`, `${base}.jsx`, `${base}.html`, `${base}/index.js`, `${base}/index.ts`]) if (!out.includes(candidate)) out.push(candidate); } return out; }
function goalAwareSelect(goal, inspected) { const wantsUi = /interface|interface utilisateur|ui|page|écran|html|principal/i.test(String(goal)); return inspected.slice().sort((a,b) => (relevance(b.path,b.result?.content)+(wantsUi && /router/i.test(b.path)?-35:0)+(wantsUi && /(<main|<body|doctype|document\.createelement|innerhtml|page\s*=)/i.test(b.result?.content||'')?45:0)) - (relevance(a.path,a.result?.content)+(wantsUi && /router/i.test(a.path)?-35:0)+(wantsUi && /(<main|<body|doctype|document\.createelement|innerhtml|page\s*=)/i.test(a.result?.content||'')?45:0)))[0]?.path; }

async function poll() {
  if (stopped) return;
  try { const claimed = await remote.claim(); if (claimed?.job) await processRemoteJob(claimed.job); else if (claimed?.id || claimed?.job_id) await processRemoteJob(claimed); }
  catch (error) { if (error.status !== 401 && error.status !== 403) console.error(`MEL_DEV_BRIDGE_REMOTE_RETRY=${error.message}`); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: 'BRIDGE_AUTH_REQUIRED' });
    const url = new URL(req.url, 'http://localhost');
    const body = await new Promise(resolve => { let s = ''; req.on('data', d => s += d); req.on('end', () => resolve(s ? JSON.parse(s) : {})); });
    if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, { online: true, branch: await bridge.currentBranch(), worker_url: remote.base });
    if (req.method === 'GET' && url.pathname === '/jobs') return json(res, 200, { jobs: jobs.list() });
    if (req.method === 'POST' && url.pathname === '/jobs') return json(res, 201, jobs.create(body));
    const match = url.pathname.match(/^\/jobs\/([^/]+)\/(claim|rollback|test)$/);
    if (match) { const [, id, op] = match; if (op === 'claim') return json(res, 200, jobs.claim(id)); if (op === 'rollback') return json(res, 200, await bridge.rollbackCandidate(id)); if (op === 'test') return json(res, 200, await bridge.runTests(body.command, id)); }
    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) { return json(res, error.code === 'BRIDGE_AUTH_REQUIRED' ? 401 : 400, { error: error.code || error.message }); }
});

const heartbeatTimer = setInterval(() => remote.heartbeat().catch(error => {
  if (error.status !== 401 && error.status !== 403) console.error(`MEL_DEV_BRIDGE_HEARTBEAT_RETRY=${error.message}`);
}), 30000);
const pollTimer = setInterval(poll, Number(process.env.MEL_DEV_BRIDGE_POLL_MS || 3000));
remote.heartbeat().catch(error => console.error(`MEL_DEV_BRIDGE_HEARTBEAT_RETRY=${error.message}`));
server.listen(Number(process.env.MEL_DEV_BRIDGE_PORT || 8788), '127.0.0.1', () => console.log(`MEL_DEV_BRIDGE_ONLINE worker=${remote.base} dns_order=${process.env.MEL_DEV_DNS_ORDER || 'ipv4first'}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopped = true; clearInterval(heartbeatTimer); clearInterval(pollTimer); server.close(() => process.exit(0)); });
