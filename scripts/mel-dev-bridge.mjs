import http from 'node:http';
import path from 'node:path';
import { LocalDevBridge } from '../src/dev/dev-bridge.js';
import { DevJobService } from '../src/dev/dev-job-service.js';
import { parseSearchPaths, rankSearchPaths } from '../src/dev/search-paths.js';

const MAX_REPAIR_CYCLES = Math.max(1, Math.min(3, Number(process.env.MEL_DEV_MAX_REPAIR_CYCLES || 2)));

export class RemoteWorkerClient {
  constructor({ workerUrl = process.env.MEL_DEV_WORKER_URL || 'https://meliturgos.adrien-lopezcarreras.workers.dev', token = process.env.MEL_DEV_BRIDGE_TOKEN, fetchImpl = fetch } = {}) {
    if (!token) throw new Error('MEL_DEV_BRIDGE_TOKEN is required');
    this.base = workerUrl.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(pathname, body = {}) {
    const response = await this.fetch(`${this.base}${pathname}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP_${response.status}`);
      error.status = response.status;
      error.code = data.code || `HTTP_${response.status}`;
      error.details = data.details;
      throw error;
    }
    return data;
  }

  heartbeat() { return this.request('/api/dev-bridge/heartbeat', { status: 'ONLINE' }); }
  claim() { return this.request('/api/dev-bridge/claim'); }
  mentor(payload) { return this.request('/api/dev-bridge/mentor', payload); }
  mentorOutcome(payload) { return this.request('/api/dev-bridge/mentor/outcome', payload); }
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

function relevance(file, content = '') {
  const p = String(file).toLowerCase();
  const c = String(content).toLowerCase();
  let n = 0;
  if (p.startsWith('src/')) n += 20;
  if (/(interface|page|ui|component|route|dev|learning|mentor|roadmap)/.test(p)) n += 15;
  if (/(<main|add eventlistener|fetch\(|export|<!doctype html|class |function |not_implemented|todo|stub)/.test(c)) n += 20;
  if (/^(imports|exports|docs)\//.test(p)) n -= 40;
  if (/\.json$/.test(p)) n -= 20;
  return n;
}

function resolveLocalImports(file, content) {
  const out = [];
  const re = /(?:import\s+(?:[^'";]+?\s+from\s+)?|require\s*\(|import\s*\()(['"])(\.[^'" ]+)\1/g;
  let m;
  while ((m = re.exec(content))) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[2]));
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}.ts`, `${base}.tsx`, `${base}.jsx`, `${base}.html`, `${base}/index.js`, `${base}/index.ts`]) {
      if (!out.includes(candidate)) out.push(candidate);
    }
  }
  return out;
}

function goalAwareSelect(goal, inspected) {
  const value = String(goal || '');
  const wantsUi = /interface|interface utilisateur|ui|page|écran|html|principal/i.test(value);
  const wantsRoadmap = /roadmap|feuille\s+de\s+route|continue.*d[ée]veloppement|poursuis.*d[ée]veloppement/i.test(value);
  return inspected.slice().sort((a, b) => {
    const score = item => relevance(item.path, item.content)
      + (wantsUi && /router/i.test(item.path) ? -35 : 0)
      + (wantsUi && /(<main|<body|doctype|document\.createelement|innerhtml|page\s*=)/i.test(item.content || '') ? 45 : 0)
      + (wantsRoadmap && /roadmap\/master-roadmap\.js$/i.test(item.path) ? 70 : 0);
    return score(b) - score(a);
  })[0]?.path;
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

async function inspectFile(candidate, id, inspected, steps) {
  if (!candidate || inspected.some(x => x.path === candidate)) return;
  try {
    const read = await bridge.bus.execute('code.read', { path: candidate, job_id: id }, { owner: 'dev-bridge', requestId: id });
    const content = String(read?.content || '');
    inspected.push({ path: candidate, content });
    steps.push({ capability: 'code.read', path: candidate, bytes: content.length });
  } catch {
    // Search results can contain paths that are intentionally denied or stale.
  }
}

async function refreshFiles(paths, id) {
  const out = [];
  for (const file of unique(paths).slice(0, 8)) {
    try {
      const read = await bridge.bus.execute('code.read', { path: file, job_id: id }, { owner: 'dev-bridge', requestId: id });
      out.push({ path: file, content: String(read?.content || '') });
    } catch {}
  }
  return out;
}

async function runProposedTests(id, tests, steps) {
  const names = unique(Array.isArray(tests) ? tests : []).slice(0, 4);
  if (!names.length) names.push('test:smoke');
  const results = [];
  for (const command of names) {
    const result = await bridge.bus.execute('dev.test', { job_id: id, command }, { owner: 'dev-bridge', requestId: id });
    const normalized = {
      command,
      exit_code: Number(result?.exit_code ?? -1),
      passed: Number(result?.exit_code) === 0,
      stdout: String(result?.stdout || '').slice(-12000),
      stderr: String(result?.stderr || '').slice(-12000),
    };
    results.push(normalized);
    steps.push({ capability: 'dev.test', command, passed: normalized.passed });
    if (!normalized.passed) break;
  }
  return results;
}

async function applyProposal(id, proposal, steps) {
  const changed = [];
  for (const file of proposal?.changes || []) {
    await bridge.bus.execute('dev.apply_change', { job_id: id, path: file.path, content: file.content }, { owner: 'dev-bridge', requestId: id });
    changed.push(file.path);
    steps.push({ capability: 'dev.apply_change', path: file.path, reason: file.reason || '' });
  }
  if (!changed.length) throw Object.assign(new Error('MENTOR_RETURNED_NO_CHANGES'), { code: 'MENTOR_RETURNED_NO_CHANGES' });
  return changed;
}

async function processRemoteJob(job) {
  const id = job.job_id || job.id;
  const context = { owner: 'dev-bridge', requestId: id };
  const steps = [];
  const attempts = [];
  let changedPaths = [];

  try {
    await bridge.bus.execute('dev.create_candidate', { job_id: id }, context);
    steps.push({ capability: 'dev.create_candidate' });

    const goal = String(job.goal || '');
    const wantsRoadmap = /roadmap|feuille\s+de\s+route|continue.*d[ée]veloppement|poursuis.*d[ée]veloppement/i.test(goal);
    const query = wantsRoadmap
      ? '(?i)roadmap|NOT_IMPLEMENTED|TODO|stub|planned'
      : (/interface|fichier|chemin|principal/i.test(goal) ? 'interface' : goal.slice(0, 120));
    const search = await bridge.bus.execute('code.search', { query, job_id: id }, context);
    steps.push({ capability: 'code.search', query });
    const text = search?.result?.stdout || search?.stdout || '';
    const paths = parseSearchPaths(text);
    const ranked = rankSearchPaths(paths);
    const inspected = [];

    // A roadmap continuation always starts from the canonical roadmap, even if
    // a textual search returns no match or ranks another source first.
    if (wantsRoadmap) await inspectFile('src/roadmap/master-roadmap.js', id, inspected, steps);
    for (const candidate of ranked.slice(0, 6)) await inspectFile(candidate, id, inspected, steps);
    for (let depth = 0; depth < 2 && inspected.length < 8; depth++) {
      const current = inspected.slice();
      for (const item of current) {
        for (const target of resolveLocalImports(item.path, item.content)) {
          if (inspected.length >= 8) break;
          if (/^(src\/dev|src\/teachers|src\/learning|src\/roadmap|tests|migrations)\//.test(target)
            || /ui|page|view|render|template|interface|mvp|main|app|home|professor|mentor|roadmap/i.test(target)) {
            await inspectFile(target, id, inspected, steps);
          }
        }
      }
    }

    if (!inspected.length) {
      for (const fallback of ['src/roadmap/master-roadmap.js', 'src/index.js', 'src/router.js', 'src/pages/mvp-interface.js', 'src/dev/runtime-api.js']) {
        await inspectFile(fallback, id, inspected, steps);
      }
    }

    const selected = goalAwareSelect(job.goal, inspected);
    const mentorResult = await remote.mentor({
      job_id: id,
      goal: job.goal,
      mode: 'implement',
      inspected_files: inspected,
      previous_attempts: [],
    });
    steps.push({ capability: 'mentor.propose', selected_provider: mentorResult?.council?.selected_provider, confidence: mentorResult?.proposal?.confidence });

    let proposal = mentorResult.proposal;
    changedPaths.push(...await applyProposal(id, proposal, steps));
    let testResults = await runProposedTests(id, proposal.tests, steps);

    for (let cycle = 1; cycle <= MAX_REPAIR_CYCLES && testResults.some(x => !x.passed); cycle++) {
      const diff = await bridge.bus.execute('code.diff', { job_id: id }, context);
      const failure = testResults.find(x => !x.passed);
      attempts.push({
        cycle,
        failed_test: failure?.command,
        exit_code: failure?.exit_code,
        stdout: failure?.stdout,
        stderr: failure?.stderr,
        diff: diff?.result?.patch || diff?.result?.stat || diff?.result?.stdout || '',
      });
      const currentFiles = await refreshFiles(unique([...changedPaths, ...inspected.map(x => x.path)]), id);
      const repairResult = await remote.mentor({
        job_id: id,
        goal: job.goal,
        mode: 'repair',
        inspected_files: currentFiles,
        previous_attempts: attempts,
      });
      steps.push({ capability: 'mentor.repair', cycle, selected_provider: repairResult?.council?.selected_provider, confidence: repairResult?.proposal?.confidence });
      proposal = repairResult.proposal;
      changedPaths.push(...await applyProposal(id, proposal, steps));
      testResults = await runProposedTests(id, proposal.tests, steps);
    }

    const allPassed = testResults.length > 0 && testResults.every(x => x.passed);
    const diff = await bridge.bus.execute('code.diff', { job_id: id }, context);
    const report = await bridge.bus.execute('dev.report', { job_id: id }, context);
    steps.push({ capability: 'code.diff', clean: Number(diff?.result?.exit_code ?? 1) === 0 });

    if (!allPassed) {
      await remote.mentorOutcome({
        job_id: id,
        outcome: 'FAILED',
        lesson: 'Les changements générés ont encore un test en échec après les cycles de réparation autorisés.',
        evidence: { changed_paths: unique(changedPaths), tests: testResults, attempts },
        score: 0,
        tags: ['tests', 'repair-needed'],
      }).catch(() => {});
      return remote.result({
        job_id: id,
        status: 'FAILED',
        files_json: unique(changedPaths),
        tests_json: testResults,
        error: 'MENTOR_TESTS_FAILED',
        result_json: { steps, tests: testResults, attempts },
      });
    }

    const diffSummary = String(diff?.result?.stat || diff?.result?.stdout || 'CHANGES_READY').trim() || 'CHANGES_READY';
    const result = {
      answer: selected || unique(changedPaths)[0] || 'Modification autonome prête à relire',
      steps,
      files: unique(changedPaths),
      tests: testResults,
      attempts,
      diff_summary: diffSummary,
    };

    await remote.mentorOutcome({
      job_id: id,
      outcome: 'SUCCEEDED',
      lesson: 'Le Mentor Council a généré du code, le bridge l’a appliqué et les tests proposés ont réussi. La candidate attend une validation humaine avant commit.',
      evidence: { changed_paths: unique(changedPaths), tests: testResults, diff_summary: diffSummary },
      score: 1,
      tags: ['tests-passed', 'candidate-ready'],
    }).catch(() => {});

    return remote.result({
      job_id: id,
      status: 'READY_FOR_REVIEW',
      candidate_branch: report.branch,
      files_json: unique(changedPaths),
      tests_json: testResults,
      diff_summary: diffSummary,
      result_json: result,
      plan_json: { steps: steps.map(s => s.capability) },
    });
  } catch (error) {
    await remote.mentorOutcome({
      job_id: id,
      outcome: 'FAILED',
      lesson: `Échec du cycle autonome: ${error.code || error.message}`,
      evidence: { changed_paths: unique(changedPaths), attempts, error: error.details || null },
      score: 0,
      tags: ['bridge-failure'],
    }).catch(() => {});
    return remote.result({ job_id: id, status: 'FAILED', error: error.code || error.message, result_json: { steps, attempts } });
  }
}

async function poll() {
  if (stopped) return;
  try {
    const claimed = await remote.claim();
    if (claimed?.job) await processRemoteJob(claimed.job);
    else if (claimed?.id || claimed?.job_id) await processRemoteJob(claimed);
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) console.error(`MEL_DEV_BRIDGE_REMOTE_RETRY=${error.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: 'BRIDGE_AUTH_REQUIRED' });
    const url = new URL(req.url, 'http://localhost');
    const body = await new Promise(resolve => {
      let s = '';
      req.on('data', d => s += d);
      req.on('end', () => resolve(s ? JSON.parse(s) : {}));
    });
    if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, { online: true, branch: await bridge.currentBranch(), worker_url: remote.base, repair_cycles: MAX_REPAIR_CYCLES });
    if (req.method === 'GET' && url.pathname === '/jobs') return json(res, 200, { jobs: jobs.list() });
    if (req.method === 'POST' && url.pathname === '/jobs') return json(res, 201, jobs.create(body));
    const match = url.pathname.match(/^\/jobs\/([^/]+)\/(claim|rollback|test)$/);
    if (match) {
      const [, id, op] = match;
      if (op === 'claim') return json(res, 200, jobs.claim(id));
      if (op === 'rollback') return json(res, 200, await bridge.rollbackCandidate(id));
      if (op === 'test') return json(res, 200, await bridge.runTests(body.command, id));
    }
    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    return json(res, error.code === 'BRIDGE_AUTH_REQUIRED' ? 401 : 400, { error: error.code || error.message });
  }
});

const heartbeatTimer = setInterval(() => remote.heartbeat().catch(() => {}), 30000);
const pollTimer = setInterval(poll, Number(process.env.MEL_DEV_BRIDGE_POLL_MS || 3000));
remote.heartbeat().catch(error => console.error(`MEL_DEV_BRIDGE_HEARTBEAT_RETRY=${error.message}`));
server.listen(Number(process.env.MEL_DEV_BRIDGE_PORT || 8788), '127.0.0.1', () => console.log('MEL_DEV_BRIDGE_ONLINE'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopped = true;
  clearInterval(heartbeatTimer);
  clearInterval(pollTimer);
  server.close(() => process.exit(0));
});
