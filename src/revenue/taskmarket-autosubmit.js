// MEL WORK — automatic Taskmarket submission through the owner's PC.
//
// The Taskmarket CLI and MEL's wallet live on Adrien's PC (keystore never leaves
// it). When the scheduled cycle produces a draft that needs no human step, for
// a bounty task, MEL queues ONE fixed Companion command: download the draft
// through a single-use ticket, check its SHA-256, re-read the task, submit it.
// Limits: bounty tasks only, never twice the same task, MEL_WORK_DAILY_SUBMISSIONS
// per day (default 3, first submissions on a bounty are free), switch off with
// MEL_WORK_AUTOSUBMIT=off. Nothing here can move funds.

import { selectAgentDevice } from '../devices/computer-agent.js';
import { createDeviceFileTicket } from '../devices/mini-flash-companion.js';
import { submitTaskmarketCloud } from './taskmarket-cloud.js';

const DEFAULT_ORIGIN = 'https://meliturgos.adrien-lopezcarreras.workers.dev';
const TASK_ID = /^0x[0-9a-f]{64}$/i;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function ensureTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS mel_work_submissions (task_id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL, command_id TEXT, status TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run();
}

const SUBMIT = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$id='__TASK__';$url='__URL__';$sha='__SHA__'
$dir=Join-Path $env:LOCALAPPDATA 'MEL\taskmarket';New-Item -ItemType Directory -Force -Path $dir|Out-Null
$f=Join-Path $dir ($id.Substring(2,16)+'.md')
Invoke-WebRequest -Uri $url -OutFile $f -UseBasicParsing -TimeoutSec 60
if((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha){throw 'DRAFT_SHA256_MISMATCH'}
function T([string[]]$a){$p=$ErrorActionPreference;$ErrorActionPreference='Continue';try{$o=@(& taskmarket @a 2>&1|ForEach-Object{[string]$_})}finally{$ErrorActionPreference=$p};return (($o -join [string][char]10).Trim())}
$task=T @('task','get',$id)
if($task -notmatch '"submissionWindowOpen"\s*:\s*true'){[ordered]@{action='taskmarket.submit';task_id=$id;submitted=$false;reason='SUBMISSION_WINDOW_CLOSED';task=$task.Substring(0,[Math]::Min(1200,$task.Length))}|ConvertTo-Json -Compress;exit 0}
$out=T @('task','submit',$id,'--file',$f,'--role','final')
$ok=$out -match '"ok"\s*:\s*true'
[ordered]@{action='taskmarket.submit';task_id=$id;submitted=$ok;result=$out.Substring(0,[Math]::Min(1500,$out.Length))}|ConvertTo-Json -Compress
`;

export function taskmarketSubmitCommand({ taskId, downloadUrl, sha256 }) {
  if (!TASK_ID.test(String(taskId || ''))) throw new Error('TASKMARKET_TASK_ID_INVALID');
  if (!/^https:\/\/[^\s'"`]+\/api\/computer\/v1\/device-file\?ticket=[a-f0-9]{48}$/.test(String(downloadUrl || ''))) throw new Error('TASKMARKET_DRAFT_URL_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(sha256 || ''))) throw new Error('TASKMARKET_DRAFT_SHA_INVALID');
  return { command: SUBMIT.replaceAll('__TASK__', taskId.toLowerCase()).replaceAll('__URL__', downloadUrl).replaceAll('__SHA__', sha256), timeout_ms: 110_000 };
}

export async function queueTaskmarketSubmission(env, { artifactId, taskId, mode, status, now = Date.now() }) {
  if (String(env?.MEL_WORK_AUTOSUBMIT || 'on').toLowerCase() === 'off') return { status: 'AUTOSUBMIT_DISABLED' };
  if (mode !== 'bounty') return { status: 'NOT_A_BOUNTY' };
  if (status !== 'DRAFT_UNVERIFIED' && status !== 'VERIFIED_LOCALLY') return { status: 'NEEDS_OWNER' };
  if (!TASK_ID.test(String(taskId || '')) || !/^work-[a-f0-9]{64}$/.test(String(artifactId || ''))) return { status: 'INVALID_IDS' };
  const db = env.DB;
  await ensureTable(db);
  if (await db.prepare('SELECT task_id FROM mel_work_submissions WHERE task_id=?').bind(taskId.toLowerCase()).first()) return { status: 'ALREADY_SUBMITTED' };
  const limit = Math.max(0, Math.min(10, Number(env.MEL_WORK_DAILY_SUBMISSIONS) || 3));
  const today = (await db.prepare('SELECT COUNT(*) AS n FROM mel_work_submissions WHERE created_at > ?').bind(now - 86_400_000).first())?.n || 0;
  if (today >= limit) return { status: 'DAILY_LIMIT_REACHED', limit };
  // PC off is no longer a blocker: with the keystore in MEL's vault the hand-in
  // is signed and sent from the cloud. Without it, the PC route below is used.
  const draft = await db.prepare('SELECT content FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
  if (!draft?.content) return { status: 'DRAFT_NOT_FOUND' };
  const cloud = await submitTaskmarketCloud(env, { taskId, content: draft.content }).catch(error => ({ status: 'CLOUD_SUBMIT_FAILED', code: String(error?.code || error?.message || '').slice(0, 80) }));
  if (cloud.status !== 'NO_CLOUD_WALLET' && cloud.status !== 'CLOUD_SUBMIT_FAILED') {
    if (['SUBMITTED', 'REJECTED', 'WINDOW_CLOSED', 'PAYMENT_REQUIRED_REFUSED'].includes(cloud.status)) {
      await db.prepare('INSERT INTO mel_work_submissions (task_id,artifact_id,command_id,status,detail,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .bind(taskId.toLowerCase(), artifactId, 'cloud', cloud.status, JSON.stringify(cloud).slice(0, 2000), now, now).run();
    }
    return cloud;
  }
  const device = await selectAgentDevice(db, now).catch(() => null);
  if (!device) return { status: 'COMPANION_OFFLINE' };
  const artifact = await db.prepare('SELECT content FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
  if (!artifact?.content) return { status: 'DRAFT_NOT_FOUND' };
  const sha256 = await sha256Hex(artifact.content);
  const ticket = await createDeviceFileTicket(env, { key: 'mel-work:' + artifactId, sha256 }, now);
  const origin = String(env.MEL_PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
  const step = taskmarketSubmitCommand({ taskId, downloadUrl: origin + '/api/computer/v1/device-file?ticket=' + ticket, sha256 });
  const commandId = crypto.randomUUID();
  const plan = { schema: 'mel.devices.pc-control.v1', owner_authorized: true, steps: [{ id: 'pc-control-1', action: 'system.exec', payload: step }] };
  await db.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)').bind(commandId, device.id, 'mel-work-submit-' + commandId, JSON.stringify(plan), 'PENDING', now).run();
  await db.prepare('INSERT INTO mel_work_submissions (task_id,artifact_id,command_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(taskId.toLowerCase(), artifactId, commandId, 'QUEUED', now, now).run();
  return { status: 'QUEUED', commandId };
}

// Reads back the Companion results of queued submissions (run every hour).
export async function refreshTaskmarketSubmissions(env, { now = Date.now() } = {}) {
  const db = env?.DB;
  if (!db?.prepare) return { updated: 0 };
  await ensureTable(db);
  const rows = (await db.prepare("SELECT task_id, command_id FROM mel_work_submissions WHERE status='QUEUED' LIMIT 20").all())?.results || [];
  let updated = 0;
  for (const row of rows) {
    const cmd = await db.prepare('SELECT status, result_json, error_code FROM computer_commands WHERE id=?').bind(row.command_id).first();
    if (!cmd || cmd.status === 'PENDING' || cmd.status === 'RUNNING') continue;
    let out = null;
    try { out = JSON.parse(String(JSON.parse(cmd.result_json || '{}')?.outputs?.[0]?.stdout || '').trim()); } catch {}
    const status = cmd.status !== 'SUCCEEDED' ? 'FAILED' : out?.submitted === true ? 'SUBMITTED' : out?.reason === 'SUBMISSION_WINDOW_CLOSED' ? 'WINDOW_CLOSED' : 'REJECTED';
    await db.prepare('UPDATE mel_work_submissions SET status=?, detail=?, updated_at=? WHERE task_id=?').bind(status, JSON.stringify(out || { error: cmd.error_code || null }).slice(0, 2000), now, row.task_id).run();
    updated += 1;
  }
  return { updated };
}

export async function listTaskmarketSubmissions(db, { limit = 20 } = {}) {
  await ensureTable(db);
  return (await db.prepare('SELECT task_id, artifact_id, status, detail, created_at, updated_at FROM mel_work_submissions ORDER BY created_at DESC LIMIT ?').bind(limit).all())?.results || [];
}
