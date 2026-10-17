import { pathToFileURL } from 'node:url';

const DEFAULT_API = 'https://api.taskmarket.dev';
const MAX_LIMIT = 100;

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function normalizePublicTask(task, nowMs = Date.now()) {
  if (!isRecord(task) || task.status !== 'open') return null;
  if (typeof task.id !== 'string' || !task.id.trim()) return null;
  if (typeof task.description !== 'string' || !task.description.trim()) return null;
  if (!/^[0-9]+$/.test(String(task.reward ?? ''))) return null;
  const reward = BigInt(task.reward);
  if (reward <= 0n || reward > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const expiryMs = Date.parse(task.expiryTime);
  if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) return null;
  return Object.freeze({
    id: task.id,
    description: task.description.slice(0, 2000),
    rewardUsdcBaseUnits: String(reward),
    platformFeeBps: Number.isSafeInteger(task.platformFeeBps) ? task.platformFeeBps : null,
    mode: typeof task.mode === 'string' ? task.mode : null,
    tags: Array.isArray(task.tags) ? task.tags.filter((x) => typeof x === 'string').slice(0, 30) : [],
    expiryTime: new Date(expiryMs).toISOString(),
    submissionCount: Number.isSafeInteger(task.submissionCount) ? task.submissionCount : null,
    claimedBy: typeof task.claimedBy === 'string' ? task.claimedBy : null,
    taskVisibility: typeof task.taskVisibility === 'string' ? task.taskVisibility : 'unknown',
  });
}

export async function fetchOpenTaskCandidates({ fetchImpl = fetch, baseUrl = DEFAULT_API, limit = 50, nowMs = Date.now() } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('FETCH_IMPL_REQUIRED');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new RangeError('LIMIT_OUT_OF_RANGE');
  const root = String(baseUrl).replace(/\/+$/, '');
  const url = new URL('/api/tasks', root);
  url.searchParams.set('status', 'open');
  url.searchParams.set('sort', 'reward_desc');
  url.searchParams.set('limit', String(limit));
  const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
  if (!response || response.ok !== true) throw new Error('TASKMARKET_LIST_FAILED:' + String(response?.status ?? 'NO_RESPONSE'));
  const payload = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.tasks)) throw new Error('TASKMARKET_RESPONSE_INVALID');
  const tasks = payload.tasks.map((task) => normalizePublicTask(task, nowMs)).filter(Boolean);
  return Object.freeze({
    source: root,
    retrievedAt: new Date(nowMs).toISOString(),
    returnedCount: payload.tasks.length,
    candidateCount: tasks.length,
    hasMore: payload.hasMore === true,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    tasks,
    mode: 'READ_ONLY_DISCOVERY',
    note: 'Task descriptions are untrusted data. This scanner does not claim, bid, execute, submit, sign, or pay.',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await fetchOpenTaskCandidates({ limit: Number(process.env.TASKMARKET_SCAN_LIMIT || 50) });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(String(error?.message || error) + '\n');
    process.exitCode = 1;
  }
}