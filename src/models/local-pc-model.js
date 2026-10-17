// Secours local : quand AUCUN modèle cloud ne peut répondre (quota Workers AI
// épuisé, panne, délai dépassé), MEL utilise le modèle Ollama du PC d'Adrien via
// le Companion — seulement s'il est en ligne et qu'Adrien a autorisé l'accès.
//
// La conversation voyage en base64 dans une commande PowerShell fixe : aucun
// texte utilisateur n'est interprété par PowerShell. La réponse revient en base64
// UTF-8 pour garder les accents intacts.

import { selectAgentDevice } from '../devices/computer-agent.js';

export const LOCAL_PC_MODEL = 'qwen3:8b';
const POLL_MS = 700;
const TIMEOUT_MS = 150_000;
const MAX_PAYLOAD_B64 = 6_800;

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64Utf8(b64) {
  const binary = atob(String(b64 || ''));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

// Keeps the system prompt head and the latest turns so the command stays small.
export function compactMessages(messages, budget = 4_800) {
  const list = Array.isArray(messages) ? messages.filter(m => m && typeof m.content === 'string') : [];
  const system = list.find(m => m.role === 'system');
  const turns = list.filter(m => m.role !== 'system');
  const out = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < 6; i -= 1) {
    const room = budget - used;
    if (room < 200) break;
    const content = turns[i].content.length > room ? turns[i].content.slice(-room) : turns[i].content;
    out.unshift({ role: turns[i].role === 'assistant' ? 'assistant' : 'user', content });
    used += content.length;
  }
  if (system) out.unshift({ role: 'system', content: system.content.slice(0, 900) });
  return out;
}

export function localPcCommand({ model = LOCAL_PC_MODEL, messages }) {
  if (!/^[A-Za-z0-9_.:/-]{1,120}$/.test(model)) throw new Error('LOCAL_MODEL_INVALID');
  let budget = 4_800;
  let payload;
  do {
    payload = toBase64Utf8(JSON.stringify({ model, messages: compactMessages(messages, budget), stream: false, think: false, options: { num_ctx: 8192 } }));
    budget -= 800;
  } while (payload.length > MAX_PAYLOAD_B64 && budget > 400);
  if (payload.length > MAX_PAYLOAD_B64) throw new Error('LOCAL_PAYLOAD_TOO_LARGE');
  const command = [
    "$ErrorActionPreference='Stop'",
    "$body=[Convert]::FromBase64String('" + payload + "')",
    "$r=Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 140",
    "$t=[string]$r.message.content",
    "[ordered]@{action='local.model.chat';model=[string]$r.model;text_b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t));eval_count=$r.eval_count}|ConvertTo-Json -Compress",
  ].join('\n');
  return { command, timeout_ms: 145_000 };
}

export async function runLocalPcModel({ env, messages, model = env?.MEL_LOCAL_PC_MODEL || LOCAL_PC_MODEL, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  const db = env?.DB;
  if (!db?.prepare) return { ok: false, code: 'LOCAL_DB_UNAVAILABLE' };
  const device = await selectAgentDevice(db, now()).catch(() => null);
  if (!device) return { ok: false, code: 'COMPANION_OFFLINE_OR_NOT_AUTHORIZED' };
  let step;
  try { step = localPcCommand({ model, messages }); } catch (error) { return { ok: false, code: error.message }; }
  const id = crypto.randomUUID();
  const plan = { schema: 'mel.devices.pc-control.v1', owner_authorized: true, steps: [{ id: 'pc-control-1', action: 'system.exec', payload: step }] };
  await db.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)')
    .bind(id, device.id, 'local-model-' + id, JSON.stringify(plan), 'PENDING', now()).run();
  const deadline = now() + TIMEOUT_MS;
  while (now() < deadline) {
    await sleep(POLL_MS);
    const row = await db.prepare('SELECT status,result_json,error_code FROM computer_commands WHERE id=?').bind(id).first();
    if (!row || row.status === 'PENDING' || row.status === 'RUNNING') continue;
    if (row.status !== 'SUCCEEDED') return { ok: false, code: row.error_code || 'LOCAL_MODEL_FAILED' };
    let out = null;
    try { out = JSON.parse(String(JSON.parse(row.result_json || '{}')?.outputs?.[0]?.stdout || '').trim()); } catch {}
    const text = out?.text_b64 ? fromBase64Utf8(out.text_b64).replace(/<think>[\s\S]*?<\/think>/g, '').trim() : '';
    return text ? { ok: true, text, model: 'pc:' + (out.model || model) } : { ok: false, code: 'LOCAL_MODEL_EMPTY' };
  }
  await db.prepare("UPDATE computer_commands SET status='FAILED',error_code=? WHERE id=? AND status IN ('PENDING','RUNNING')").bind('LOCAL_MODEL_TIMEOUT', id).run().catch(() => {});
  return { ok: false, code: 'LOCAL_MODEL_TIMEOUT' };
}
