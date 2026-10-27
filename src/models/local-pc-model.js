// Deux règles, dans cet ordre.
// 1. Le code part d'abord sur qwen2.5-coder:7b quand le PC est connecté.
//    Le codeur en ligne n'est appelé que si cette proposition est refusée
//    ou si GitHub a déjà refusé le changement.
// 2. Quand le quota cloud est épuisé, le reste du texte part aussi sur le PC.
//    Un PC absent n'est pas un modèle, et les médias restent hors de ce chemin.
//
// La conversation voyage en base64 dans une commande PowerShell fixe : aucun
// texte utilisateur n'est interprété par PowerShell. La réponse revient en base64
// UTF-8 pour garder les accents intacts.

import { selectAgentDevice, diagnoseAgentDevice } from '../devices/computer-agent.js';
import { ProviderAdapter } from '../augmentio/provider-adapter.js';

export const LOCAL_PC_MODEL = 'qwen3:8b';
// Fits the RX 9060 (8 GB). A larger coder does not load, so it cannot code.
export const LOCAL_PC_CODER_MODEL = 'qwen2.5-coder:7b';
export const ONLINE_CODER_MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct';
const POLL_MS = 700;
const TIMEOUT_MS = 600_000;
const COMMAND_LIMIT = 8_000;

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
export function compactMessages(messages, budget = 16_000) {
  const list = Array.isArray(messages) ? messages.filter(m => m && typeof m.content === 'string') : [];
  const system = list.find(m => m.role === 'system');
  const turns = list.filter(m => m.role !== 'system');
  const out = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < 24; i -= 1) {
    const room = budget - used;
    if (room < 200) break;
    const content = turns[i].content.length > room ? turns[i].content.slice(-room) : turns[i].content;
    out.unshift({ role: turns[i].role === 'assistant' ? 'assistant' : 'user', content });
    used += content.length;
  }
  if (system) out.unshift({ role: 'system', content: system.content.slice(0, Math.min(4_000, budget)) });
  return out;
}

export function chooseLocalModel(messages, requested = '') {
  const blob = [requested, ...(Array.isArray(messages) ? messages : []).map(message => message?.content || '')].join('\n');
  return /\b(coder|patch|diff|function |import |export |class |```|fichier\s+src\/)/i.test(blob)
    ? LOCAL_PC_CODER_MODEL
    : LOCAL_PC_MODEL;
}

export function localPcCommand({ model = LOCAL_PC_MODEL, messages }) {
  if (!/^[A-Za-z0-9_.:/-]{1,120}$/.test(model)) throw new Error('LOCAL_MODEL_INVALID');
  let budget = 16_000;
  let command = '';
  while (budget > 300) {
    const payload = toBase64Utf8(JSON.stringify({
      model,
      messages: compactMessages(messages, budget),
      stream: false,
      think: false,
      options: { num_ctx: 32768, num_predict: 4096 },
    }));
    command = [
      "$ErrorActionPreference='Stop'",
      "$body=[Convert]::FromBase64String('" + payload + "')",
      "$pref=Join-Path $env:LOCALAPPDATA 'MEL\\" + (String(model).includes('coder') ? 'local-coder.txt' : 'local-model.txt') + "'",
      "if(Test-Path -LiteralPath $pref){$n=(Get-Content -LiteralPath $pref -Raw).Trim();if($n -match '^[A-Za-z0-9_.:/-]{1,80}$'){$o=[Text.Encoding]::UTF8.GetString($body)|ConvertFrom-Json;$o.model=$n;$body=[Text.Encoding]::UTF8.GetBytes(($o|ConvertTo-Json -Compress -Depth 8))}}",
      "$r=Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/chat' -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 580",
      "$t=[string]$r.message.content",
      "[ordered]@{action='local.model.chat';model=[string]$r.model;text_b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t));eval_count=$r.eval_count}|ConvertTo-Json -Compress",
    ].join('\n');
    if (command.length <= COMMAND_LIMIT) break;
    budget = Math.floor(budget * 0.65);
  }
  if (command.length > 8192) throw new Error('LOCAL_PAYLOAD_TOO_LARGE');
  return { command, timeout_ms: TIMEOUT_MS };
}

export async function runLocalPcModel({ env, messages, model = env?.MEL_LOCAL_PC_MODEL || LOCAL_PC_MODEL, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  const db = env?.DB;
  if (!db?.prepare) return { ok: false, code: 'LOCAL_DB_UNAVAILABLE' };
  const selection = await diagnoseAgentDevice(db, now()).catch(() => ({ device: null, code: 'COMPANION_DEVICE_LOOKUP_FAILED' }));
  const device = selection.device;
  if (!device) return { ok: false, code: 'COMPANION_OFFLINE_OR_NOT_AUTHORIZED', reason: selection.code };
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

// The PC can take over only when the Companion engine is fresh, remote access
// is on, and the owner has enabled local compute. A missing PC is not a model.
export async function localPcModelReady(env, now = Date.now()) {
  const db = env?.DB;
  if (!db?.prepare) return { ok: false, code: 'LOCAL_DB_UNAVAILABLE' };
  const selection = await diagnoseAgentDevice(db, now).catch(() => ({ device: null, code: 'COMPANION_DEVICE_LOOKUP_FAILED' }));
  if (!selection.device) return { ok: false, code: 'COMPANION_OFFLINE_OR_NOT_AUTHORIZED', reason: selection.code };
  const row = await db.prepare('SELECT metadata FROM computer_devices WHERE id=?').bind(selection.device.id).first().catch(() => null);
  let metadata = {};
  try { metadata = JSON.parse(row?.metadata || '{}'); } catch { metadata = {}; }
  if (metadata.local_compute_enabled !== true) return { ok: false, code: 'LOCAL_COMPUTE_DISABLED' };
  return { ok: true, device_id: selection.device.id };
}

// The PC answers first. If it cannot, the original cloud model is asked.
// A coding request that the PC misses goes to the online coder, not to a chat model.
export function bindLocalPcWorkersAi(env, run = runLocalPcModel) {
  const cloud = env.AI;
  const dbEnv = env;
  // The Council keeps the cloud models: the PC answers one long prompt in
  // minutes and the review's 5-7 parallel calls never finished (27/10).
  if (!cloud?.__melLocalPc) env.MEL_CLOUD_AI = cloud;
  env.AI = {
    __melLocalPc: true,
    run: async (model, inputs = {}) => {
      const messages = Array.isArray(inputs.messages) && inputs.messages.length
        ? inputs.messages
        : (inputs.prompt ? [{ role: 'user', content: String(inputs.prompt) }] : null);
      if (!messages) throw Object.assign(new Error('LOCAL_MODEL_TEXT_ONLY'), { code: 'LOCAL_MODEL_TEXT_ONLY' });
      const wanted = chooseLocalModel(messages, model);
      const local = await run({ env: dbEnv, messages, model: wanted });
      if (local?.ok && String(local.text || '').trim()) {
        return { response: local.text, model: local.model, local: true };
      }
      if (typeof cloud?.run !== 'function' || cloud.__melLocalPc) {
        throw Object.assign(new Error(local?.code || 'LOCAL_MODEL_FAILED'), { code: local?.code || 'LOCAL_MODEL_FAILED' });
      }
      const online = wanted === LOCAL_PC_CODER_MODEL ? ONLINE_CODER_MODEL : model;
      const answer = await cloud.run(online, inputs);
      return { ...(answer && typeof answer === 'object' ? answer : { response: String(answer || '') }), local: false, local_fallback: local?.code || 'LOCAL_MODEL_FAILED' };
    },
  };
  env.MEL_INFERENCE = 'local-pc';
  return env;
}

// MAX codes on the PC model while it is connected. Neurons stay unused until
// this provider throws, which is how the mentor notices the PC could not do it.
export async function createLocalPcCoderProvider(env, run = runLocalPcModel) {
  const ready = await localPcModelReady(env);
  if (!ready?.ok) return null;
  const adapter = new ProviderAdapter({
    id: 'local-pc-coder',
    providerId: 'local-pc-coder',
    modelId: LOCAL_PC_CODER_MODEL,
    capabilities: ['CODE', 'CODE_SPECIALIST'],
    priority: 1000,
    estimatedCost: 0,
    costProvenance: {
      verified: true,
      addedCost: 0,
      source: 'owner-pc-ollama',
      authorization: { approved: true, policy: 'ZERO_EURO', authority: 'owner-enabled-local-compute' },
    },
    invoke: async ({ input }) => {
      const text = typeof input === 'string' ? input : String(input?.input || input?.prompt || '');
      const local = await run({ env, messages: [{ role: 'user', content: text }], model: LOCAL_PC_CODER_MODEL });
      if (!local?.ok || !String(local.text || '').trim()) {
        throw Object.assign(new Error(local?.code || 'LOCAL_CODER_FAILED'), { code: local?.code || 'LOCAL_CODER_FAILED' });
      }
      return { text: local.text, provenance: { provider: 'local-pc-coder', model: LOCAL_PC_CODER_MODEL } };
    },
  });
  adapter.maxInputChars = 7000;
  return adapter;
}

