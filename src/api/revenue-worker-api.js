import { requireAuth } from '../core/security.js';
import { maybeHandleComputerApi } from '../devices/computer-companion-api.js';

const TASKMARKET_API = 'https://api.taskmarket.dev/api/tasks';
const MAX_LIMIT = 50;
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const TASKMARKET_PC_PROBE_COMMAND = "$ErrorActionPreference='Stop';$cli=Get-Command 'taskmarket.cmd' -CommandType Application -ErrorAction SilentlyContinue|Select-Object -First 1;$npm=Get-Command 'npm.cmd' -CommandType Application -ErrorAction SilentlyContinue|Select-Object -First 1;if($null -eq $cli){[ordered]@{action='taskmarket.status';cli_available=$false;npm_available=($null -ne $npm);code='TASKMARKET_CLI_NOT_FOUND';tasks=@();scanned_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5 -Compress;exit 0};try{$out=& $cli.Source task list --status open --limit 20 2>&1;$rc=$LASTEXITCODE;$raw=($out|Out-String).Trim();if($rc -ne 0){$detail=[string]$raw;if($detail.Length -gt 1000){$detail=$detail.Substring(0,1000)};[ordered]@{action='taskmarket.status';cli_available=$true;list_available=$false;code='TASKMARKET_LIST_COMMAND_FAILED';exit_code=$rc;detail=$detail;tasks=@();scanned_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5 -Compress;exit 0};$p=$raw|ConvertFrom-Json -ErrorAction Stop;$items=@();if($null -ne $p.data -and $p.data.tasks -is [System.Array]){$items=@($p.data.tasks)}elseif($p.tasks -is [System.Array]){$items=@($p.tasks)}else{throw 'TASKMARKET_RESPONSE_SCHEMA_INVALID'};$tasks=@($items|Select-Object -First 20|ForEach-Object{$desc=[string]$_.description;if($desc.Length -gt 2500){$desc=$desc.Substring(0,2500)};[ordered]@{id=[string]$_.id;referenceCode=[string]$_.referenceCode;description=$desc;reward=[string]$_.reward;status=[string]$_.status;mode=[string]$_.mode;submissionCount=$_.submissionCount;expiryTime=[string]$_.expiryTime;platformFeeBps=$_.platformFeeBps}});[ordered]@{action='taskmarket.status';cli_available=$true;list_available=$true;task_count=$tasks.Count;tasks=$tasks;scanned_at=[DateTime]::UtcNow.ToString('o');mode='READ_ONLY'}|ConvertTo-Json -Depth 6 -Compress;exit 0}catch{[ordered]@{action='taskmarket.status';cli_available=$true;list_available=$false;code='TASKMARKET_RESPONSE_INVALID';detail=([string]$_.Exception.Message);tasks=@();scanned_at=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5 -Compress;exit 0}";

export function normalizeRevenueTasks(payload, nowMs = Date.now()) {
  const candidates = Array.isArray(payload?.data?.tasks) ? payload.data.tasks : Array.isArray(payload?.tasks) ? payload.tasks : [];
  return candidates.slice(0, MAX_LIMIT).filter((task) => {
    if (!record(task) || String(task.status || '').toLowerCase() !== 'open') return false;
    if (typeof task.id !== 'string' || typeof task.description !== 'string') return false;
    if (!/^[0-9]+$/.test(String(task.reward ?? ''))) return false;
    const reward = BigInt(task.reward);
    if (reward <= 0n || reward > BigInt(Number.MAX_SAFE_INTEGER)) return false;
    const expiry = Date.parse(task.expiryTime);
    return Number.isFinite(expiry) && expiry > nowMs;
  }).map((task) => ({
    id: task.id.slice(0, 160),
    referenceCode: typeof task.referenceCode === 'string' ? task.referenceCode.slice(0, 80) : '',
    requester: typeof task.requester === 'string' ? task.requester.slice(0, 120) : null,
    description: task.description.slice(0, 6000),
    reward: String(task.reward),
    status: 'open',
    mode: typeof task.mode === 'string' ? task.mode.slice(0, 40) : null,
    submissionCount: Number.isSafeInteger(task.submissionCount) && task.submissionCount >= 0 ? task.submissionCount : 0,
    expiryTime: new Date(Date.parse(task.expiryTime)).toISOString(),
    platformFeeBps: Number.isSafeInteger(task.platformFeeBps) && task.platformFeeBps >= 0 && task.platformFeeBps <= 10000 ? task.platformFeeBps : null,
    stakeRequired: task.stakeRequired === true,
    claimedBy: typeof task.claimedBy === 'string' ? task.claimedBy.slice(0, 160) : null,
  }));
}

export async function handleRevenueApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/revenue/tasks' && url.pathname !== '/api/revenue/taskmarket-pc-status') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (url.pathname === '/api/revenue/taskmarket-pc-status') {
    if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
    const body = await request.json().catch(() => ({}));
    const computerId = typeof body?.computer_id === 'string' ? body.computer_id.trim().slice(0, 200) : '';
    if (!computerId) return json({ ok: false, code: 'COMPUTER_ID_REQUIRED' }, 400);
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    const forwarded = new Request(new URL('/api/computer/v1/pc-control', url.origin), {
      method: 'POST',
      headers,
      body: JSON.stringify({ computer_id: computerId, action: 'system.exec', payload: { command: TASKMARKET_PC_PROBE_COMMAND, timeout_ms: 25000, require_success_exit: true } }),
    });
    return (await maybeHandleComputerApi(forwarded, env)) || json({ ok: false, code: 'COMPANION_ROUTE_UNAVAILABLE' }, 503);
  }
  if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const apiUrl = new URL(TASKMARKET_API);
    apiUrl.searchParams.set('status', 'open');
    apiUrl.searchParams.set('sort', 'reward_desc');
    apiUrl.searchParams.set('limit', String(MAX_LIMIT));
    const response = await fetch(apiUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return json({ ok: false, code: 'TASKMARKET_UPSTREAM_ERROR', upstreamStatus: response.status, tasks: [] }, 502);
    const payload = await response.json();
    if (!record(payload) || (!Array.isArray(payload?.data?.tasks) && !Array.isArray(payload?.tasks))) return json({ ok: false, code: 'TASKMARKET_RESPONSE_INVALID', tasks: [] }, 502);
    const tasks = normalizeRevenueTasks(payload);
    return json({ ok: true, source: 'taskmarket-public-api', retrievedAt: new Date().toISOString(), count: tasks.length, tasks, executionMode: 'OBSERVE_ONLY', canClaim: false, canSubmit: false });
  } catch (error) {
    return json({ ok: false, code: 'TASKMARKET_UNAVAILABLE', detail: String(error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : error?.code || error?.message || 'UNKNOWN').slice(0, 120), tasks: [] }, 503);
  }
}