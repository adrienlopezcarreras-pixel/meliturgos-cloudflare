import http from 'node:http';
import { LocalDevBridge } from '../src/dev/dev-bridge.js';
import { DevJobService } from '../src/dev/dev-job-service.js';

export class RemoteWorkerClient {
  constructor({ workerUrl = process.env.MEL_DEV_WORKER_URL || 'https://meliturgos.adrien-lopezcarreras.workers.dev', token = process.env.MEL_DEV_BRIDGE_TOKEN, fetchImpl = fetch } = {}) {
    if (!token) throw new Error('MEL_DEV_BRIDGE_TOKEN is required');
    this.base = workerUrl.replace(/\/$/, ''); this.token = token; this.fetch = fetchImpl;
  }
  async request(path, body = {}) {
    const response = await this.fetch(`${this.base}${path}`, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || `HTTP_${response.status}`); error.status = response.status; throw error; }
    return data;
  }
  heartbeat() { return this.request('/api/dev-bridge/heartbeat', { status: 'ONLINE' }); }
  claim() { return this.request('/api/dev-bridge/claim'); }
  result(payload) { return this.request('/api/dev-bridge/result', payload); }
}

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
    const paths = [...text.matchAll(/(?:^|\s|\()((?:src|worker\.js)[^:\s)]*)/gm)].map(m => m[1]).filter((p, i, a) => a.indexOf(p) === i);
    const candidatePath = paths.sort((a, b) => (/(interface|page)/i.test(b) ? 1 : 0) - (/(interface|page)/i.test(a) ? 1 : 0))[0];
    if (candidatePath) steps.push({ capability: 'code.read', path: candidatePath, result: await bridge.bus.execute('code.read', { path: candidatePath, job_id: id }, context) });
    const files = typeof job.files_json === 'string' ? JSON.parse(job.files_json || '[]') : (job.files_json || []);
    for (const file of Array.isArray(files) ? files : []) if (file?.path && typeof file.content === 'string') await bridge.bus.execute('dev.apply_change', { job_id: id, path: file.path, content: file.content }, context);
    const tests = typeof job.tests_json === 'string' ? JSON.parse(job.tests_json || '[]') : (job.tests_json || []);
    const testResult = Array.isArray(tests) && tests[0]?.command ? await bridge.bus.execute('dev.test', { job_id: id, command: tests[0].command }, context) : { command: 'read-only', passed: true };
    steps.push({ capability: 'dev.test', result: testResult });
    const diff = await bridge.bus.execute('code.diff', { job_id: id }, context);
    const report = await bridge.bus.execute('dev.report', { job_id: id }, context);
    steps.push({ capability: 'code.diff', result: diff });
    const answer = candidatePath || (paths[0] || 'Aucun fichier trouvé');
    const result = { answer, steps, files: candidatePath ? [candidatePath] : [], tests: [testResult], diff_summary: 'NO_CHANGES' };
    return remote.result({ job_id: id, status: 'READY_FOR_REVIEW', candidate_branch: report.branch, files_json: candidatePath ? [candidatePath] : [], tests_json: [testResult], diff_summary: 'NO_CHANGES', result_json: result, plan_json: { steps: steps.map(s => s.capability) } });
  } catch (error) { return remote.result({ job_id: id, status: 'FAILED', error: error.code || error.message }); }
}

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

const heartbeatTimer = setInterval(() => remote.heartbeat().catch(() => {}), 30000);
const pollTimer = setInterval(poll, Number(process.env.MEL_DEV_BRIDGE_POLL_MS || 3000));
remote.heartbeat().catch(error => console.error(`MEL_DEV_BRIDGE_HEARTBEAT_RETRY=${error.message}`));
server.listen(Number(process.env.MEL_DEV_BRIDGE_PORT || 8788), '127.0.0.1', () => console.log('MEL_DEV_BRIDGE_ONLINE'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopped = true; clearInterval(heartbeatTimer); clearInterval(pollTimer); server.close(() => process.exit(0)); });
