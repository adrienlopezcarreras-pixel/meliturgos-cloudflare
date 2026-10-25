// MEL WORK — Taskmarket hand-in from the cloud, PC off.
//
// Owner decision (18/10/2026): the Taskmarket keystore of the PC is copied once
// into MEL's encrypted vault. It stays encrypted there exactly as on the PC:
// like the official CLI, the Worker asks Taskmarket for the device key at each
// signature, decrypts the wallet key in memory, signs and forgets it.
// Only EIP-191 messages are signed (submission, legal acceptance): nothing here
// can move funds. Payment-gated submissions (beyond the free allowance) are
// refused, never paid.

import { createD1OAuthVaults } from '../connectors/d1-oauth-vault.js';
import { personalSign, privateKeyToAddress } from '../crypto/evm-sign.js';

export const TASKMARKET_API = 'https://api.taskmarket.dev';
const CONNECTOR = 'work.taskmarket';
const TASK_ID = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const IMPORT_TTL_MS = 30 * 60 * 1000;

const ownerOf = env => String(env?.MELITURGOS_USER || 'owner');
const vaultOf = (env, vaults) => vaults || createD1OAuthVaults(env);
const enc = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function bytesFrom(text) {
  const raw = String(text || '').trim();
  // A base64 ciphertext can legitimately start with the characters '0x'.
  // Only strip a hex prefix when the remaining payload is actually hex.
  const s = /^0x[0-9a-f]+$/i.test(raw) && (raw.length - 2) % 2 === 0 ? raw.slice(2) : raw;
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0) return Uint8Array.from(s.match(/../g), h => parseInt(h, 16));
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch { return null; }
}
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

// ---- vault -----------------------------------------------------------------

/** Validate and store the PC keystore (and any legal receipt found next to it). */
export async function saveTaskmarketWallet(env, files, { vaults } = {}) {
  const entries = files && typeof files === 'object' ? files : {};
  let keystore = null;
  let receipt = null;
  for (const [name, raw] of Object.entries(entries)) {
    let data = null;
    try { data = JSON.parse(String(raw || '')); } catch { continue; }
    if (!keystore && data && typeof data.encryptedKey === 'string' && ADDRESS.test(String(data.walletAddress || ''))) keystore = data;
    const r = data && (data.receipt || data.legalReceipt || data.legal_receipt || (/legal/i.test(name) ? data.token || data.value : null));
    if (!receipt && typeof r === 'string' && r.length >= 8 && r.length <= 4096) receipt = r;
  }
  if (!keystore || typeof keystore.deviceId !== 'string' || typeof keystore.apiToken !== 'string') {
    throw Object.assign(new Error('TASKMARKET_KEYSTORE_INVALID'), { status: 400 });
  }
  const token_set = {
    access_token: String(keystore.apiToken),
    keystore: { encryptedKey: keystore.encryptedKey, walletAddress: keystore.walletAddress.toLowerCase(), deviceId: keystore.deviceId, apiToken: keystore.apiToken },
    legal_receipt: receipt,
    imported_at: Date.now(),
  };
  await vaultOf(env, vaults).putToken({ owner: ownerOf(env), connector_id: CONNECTOR, token_set });
  return { saved: true, address: token_set.keystore.walletAddress, legal_receipt: Boolean(receipt) };
}

async function loadWallet(env, vaults) {
  try { return await vaultOf(env, vaults).getToken({ owner: ownerOf(env), connector_id: CONNECTOR }); } catch { return null; }
}

export async function taskmarketWalletStatus(env, { vaults } = {}) {
  const wallet = await loadWallet(env, vaults);
  return { cloud: Boolean(wallet?.keystore), address: wallet?.keystore?.walletAddress || null, legal_accepted: Boolean(wallet?.legal_receipt) };
}

// ---- key handling (same steps as the official CLI) ---------------------------

async function deviceKey(keystore, fetchImpl) {
  const response = await fetchImpl(TASKMARKET_API + '/api/devices/' + encodeURIComponent(keystore.deviceId) + '/key', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: keystore.deviceId, apiToken: keystore.apiToken }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data?.deviceEncryptionKey !== 'string') throw Object.assign(new Error('TASKMARKET_DEVICE_KEY_' + response.status), { code: 'TASKMARKET_DEVICE_KEY_UNAVAILABLE' });
  const key = bytesFrom(data.deviceEncryptionKey);
  if (!key || key.length !== 32) throw Object.assign(new Error('TASKMARKET_DEVICE_KEY_FORMAT'), { code: 'TASKMARKET_DEVICE_KEY_FORMAT' });
  return key;
}

/** Every plausible AES-256-GCM layout of the keystore's encryptedKey: [iv, ciphertext||tag]. */
export function encryptedKeyLayouts(encryptedKey) {
  const out = [];
  const push = (iv, data) => { if (iv && data && iv.length >= 12 && iv.length <= 16 && data.length > 16) out.push([iv, data]); };
  let value = encryptedKey;
  if (typeof value === 'string' && value.trim().startsWith('{')) { try { value = JSON.parse(value); } catch {} }
  if (value && typeof value === 'object') {
    const iv = bytesFrom(value.iv || value.nonce);
    const tag = bytesFrom(value.tag || value.authTag || value.auth_tag || '');
    const ct = bytesFrom(value.ciphertext || value.data || value.encrypted || value.content);
    if (iv && ct) push(iv, tag && tag.length === 16 ? concat(ct, tag) : ct);
    return out;
  }
  const text = String(value || '').trim();
  const parts = text.split(/[:.$]/).filter(Boolean).map(bytesFrom);
  if (parts.length === 3 && parts.every(Boolean)) {
    const [a, b, c] = parts;
    if (b.length === 16) push(a, concat(c, b)); // iv:tag:ciphertext
    if (c.length === 16) push(a, concat(b, c)); // iv:ciphertext:tag
  } else if (parts.length === 2 && parts.every(Boolean)) {
    push(parts[0], parts[1]);
  }
  const blob = bytesFrom(text);
  if (blob && blob.length > 44) {
    for (const ivLen of [12, 16]) {
      const iv = blob.slice(0, ivLen);
      push(iv, blob.slice(ivLen)); // iv | ciphertext | tag
      push(iv, concat(blob.slice(ivLen + 16), blob.slice(ivLen, ivLen + 16))); // iv | tag | ciphertext
    }
  }
  return out;
}

function privateKeyFromPlaintext(plain) {
  if (plain.length === 32) return plain;
  const text = new TextDecoder().decode(plain).trim().replace(/^"|"$/g, '');
  const key = bytesFrom(text);
  return key && key.length === 32 ? key : null;
}

/** Decrypt the wallet key in memory and prove it is the keystore's address. */
export async function unlockWallet(keystore, dek) {
  const aesKey = await crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['decrypt']);
  for (const [iv, data] of encryptedKeyLayouts(keystore.encryptedKey)) {
    let plain;
    try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data)); } catch { continue; }
    const key = privateKeyFromPlaintext(plain);
    plain.fill(0);
    if (key && privateKeyToAddress(key) === String(keystore.walletAddress).toLowerCase()) return key;
    if (key) key.fill(0);
  }
  throw Object.assign(new Error('TASKMARKET_KEYSTORE_UNLOCK_FAILED'), { code: 'TASKMARKET_KEYSTORE_UNLOCK_FAILED' });
}

async function withKey(env, { fetchImpl = fetch, vaults } = {}, fn) {
  const wallet = await loadWallet(env, vaults);
  if (!wallet?.keystore) return { status: 'NO_CLOUD_WALLET' };
  const key = await unlockWallet(wallet.keystore, await deviceKey(wallet.keystore, fetchImpl));
  try { return await fn(key, wallet); } finally { key.fill(0); }
}

async function idempotencyKey(...parts) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(parts.join('|'))));
  const h = hex(d.slice(0, 16));
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-a' + h.slice(17, 20) + '-' + h.slice(20, 32);
}

// ---- submission ------------------------------------------------------------

export async function submitTaskmarketCloud(env, { taskId, content, fileName = 'deliverable.md', fetchImpl = fetch, vaults } = {}) {
  if (!TASK_ID.test(String(taskId || ''))) return { status: 'INVALID_IDS' };
  const id = String(taskId).toLowerCase();
  const task = await fetchImpl(TASKMARKET_API + '/api/tasks/' + id, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) }).then(r => r.json()).catch(() => null);
  if (task && task.submissionWindowOpen === false) return { status: 'WINDOW_CLOSED' };
  return withKey(env, { fetchImpl, vaults }, async (key, wallet) => {
    // Taskmarket moved write actions under taskmarket:market:<kind> (official
    // CLI >= 1.20); the old taskmarket:submit message is refused UNAUTHORIZED.
    const signature = await personalSign(key, 'taskmarket:market:submit:' + id);
    const bytes = enc.encode(String(content || ''));
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    const headers = {
      'content-type': 'application/json',
      'X-Taskmarket-Idempotency-Key': await idempotencyKey('submit', id, hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))),
    };
    if (wallet.legal_receipt) headers['X-Taskmarket-Legal-Receipt'] = wallet.legal_receipt;
    const response = await fetchImpl(TASKMARKET_API + '/api/tasks/' + id + '/submissions', {
      method: 'POST', headers, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ taskId: id, workerAddress: wallet.keystore.walletAddress, signature, artifacts: [{ fileName, mimeType: 'text/markdown', role: 'final', file: btoa(bin) }] }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && (data?.success === true || data?.submissionId)) return { status: 'SUBMITTED', submissionId: data.submissionId || null };
    const code = String(data?.code || data?.error || data?.reason || ('HTTP_' + response.status)).slice(0, 120);
    if (response.status === 403 && /LEGAL_ACCEPTANCE/i.test(code)) return { status: 'LEGAL_ACCEPTANCE_REQUIRED' };
    if (response.status === 402) return { status: 'PAYMENT_REQUIRED_REFUSED' };
    return { status: 'REJECTED', code };
  });
}

// ---- legal acceptance (one owner click, policies shown first) ---------------

export async function taskmarketLegalCurrent({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(TASKMARKET_API + '/api/legal/current', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw Object.assign(new Error('TASKMARKET_LEGAL_UNAVAILABLE'), { status: 502 });
  return response.json();
}

export async function acceptTaskmarketLegal(env, { fetchImpl = fetch, vaults } = {}) {
  return withKey(env, { fetchImpl, vaults }, async (key, wallet) => {
    const address = wallet.keystore.walletAddress;
    const current = await taskmarketLegalCurrent({ fetchImpl }).catch(() => ({}));
    // Taskmarket's terms can still be a draft awaiting counsel approval: then
    // nothing can (or needs to) be accepted.
    if (current?.acceptanceAvailable === false) return { status: 'NOT_AVAILABLE_YET' };
    const challengeResponse = await fetchImpl(TASKMARKET_API + '/api/legal/challenge', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ walletAddress: address }), signal: AbortSignal.timeout(12_000),
    });
    const challenge = await challengeResponse.json().catch(() => ({}));
    if (!challengeResponse.ok || typeof challenge?.message !== 'string') throw Object.assign(new Error('TASKMARKET_LEGAL_CHALLENGE_FAILED'), { status: 502 });
    const signature = await personalSign(key, challenge.message);
    const version = challenge.bundleVersion ?? challenge.version ?? current.bundleVersion ?? current.version;
    const digest = challenge.bundleDigest ?? challenge.digest ?? current.bundleDigest ?? current.digest;
    const response = await fetchImpl(TASKMARKET_API + '/api/legal/accept/wallet', {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Taskmarket-Idempotency-Key': await idempotencyKey('legal', address, String(challenge.nonce || '')) },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ signature, nonce: challenge.nonce, walletAddress: address, bundleVersion: version, bundleDigest: digest, agreedToTerms: true, agreedToAcceptableUse: true, acknowledgedRisk: true, receivedPrivacyNotice: true }),
    });
    const data = await response.json().catch(() => ({}));
    const receipt = data?.receipt || data?.legalReceipt || data?.token;
    if (!response.ok || typeof receipt !== 'string') throw Object.assign(new Error('TASKMARKET_LEGAL_ACCEPT_FAILED:' + String(data?.code || response.status)), { status: 502 });
    await vaultOf(env, vaults).putToken({ owner: ownerOf(env), connector_id: CONNECTOR, token_set: { ...wallet, legal_receipt: receipt } });
    return { status: 'ACCEPTED' };
  });
}

// ---- one-time copy of the PC keystore ---------------------------------------

const IMPORT = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$d=if($env:TASKMARKET_HOME){$env:TASKMARKET_HOME}else{Join-Path $HOME '.taskmarket'}
if(-not (Test-Path -LiteralPath (Join-Path $d 'keystore.json'))){throw 'TASKMARKET_KEYSTORE_NOT_FOUND'}
$files=@{}
Get-ChildItem -LiteralPath $d -File -Filter *.json|Where-Object{$_.Length -lt 65536}|Select-Object -First 12|ForEach-Object{$files[$_.Name]=[IO.File]::ReadAllText($_.FullName)}
$body=@{files=$files}|ConvertTo-Json -Depth 4 -Compress
$r=Invoke-RestMethod -Method Post -Uri '__URL__' -ContentType 'application/json' -Body $body -TimeoutSec 60
[ordered]@{action='taskmarket.wallet.import';uploaded=($r.ok -eq $true);files=$files.Count}|ConvertTo-Json -Compress
`;

async function ensureTicketTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS mel_upload_tickets (ticket TEXT PRIMARY KEY, purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)').run();
}

/** Hourly: if the wallet is not in the vault yet and the PC is on, copy it once. */
export async function ensureTaskmarketWalletImport(env, { now = Date.now(), selectDevice } = {}) {
  const db = env?.DB;
  if (!db?.prepare) return { status: 'NO_DB' };
  if ((await taskmarketWalletStatus(env)).cloud) return { status: 'ALREADY_IN_VAULT' };
  await ensureTicketTable(db);
  const pending = await db.prepare("SELECT ticket FROM mel_upload_tickets WHERE purpose='taskmarket-wallet' AND used_at IS NULL AND expires_at>?").bind(now).first();
  if (pending) return { status: 'IMPORT_PENDING' };
  const pick = selectDevice || (await import('../devices/computer-agent.js')).selectAgentDevice;
  const device = await pick(db, now).catch(() => null);
  if (!device) return { status: 'COMPANION_OFFLINE' };
  const ticket = hex(crypto.getRandomValues(new Uint8Array(24)));
  await db.prepare('INSERT INTO mel_upload_tickets (ticket,purpose,expires_at) VALUES (?,?,?)').bind(ticket, 'taskmarket-wallet', now + IMPORT_TTL_MS).run();
  const origin = String(env.MEL_PUBLIC_ORIGIN || 'https://meliturgos.adrien-lopezcarreras.workers.dev').replace(/\/+$/, '');
  const command = IMPORT.replace('__URL__', origin + '/api/computer/v1/taskmarket-wallet-import?ticket=' + ticket);
  const commandId = crypto.randomUUID();
  const plan = { schema: 'mel.devices.pc-control.v1', owner_authorized: true, steps: [{ id: 'pc-control-1', action: 'system.exec', payload: { command, timeout_ms: 90_000 } }] };
  await db.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)').bind(commandId, device.id, 'mel-taskmarket-wallet-' + commandId, JSON.stringify(plan), 'PENDING', now).run();
  return { status: 'IMPORT_QUEUED', commandId };
}

/** POST /api/computer/v1/taskmarket-wallet-import?ticket=… (single use, 30 min). */
export async function handleTaskmarketWalletImport(request, env, { now = Date.now(), vaults } = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/computer/v1/taskmarket-wallet-import') return null;
  if (request.method !== 'POST') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  const ticket = String(url.searchParams.get('ticket') || '');
  if (!/^[a-f0-9]{48}$/.test(ticket) || !env?.DB?.prepare) return Response.json({ ok: false, code: 'TICKET_INVALID' }, { status: 403 });
  await ensureTicketTable(env.DB);
  const claimed = await env.DB.prepare("UPDATE mel_upload_tickets SET used_at=? WHERE ticket=? AND purpose='taskmarket-wallet' AND used_at IS NULL AND expires_at>?").bind(now, ticket, now).run();
  if (!claimed?.meta?.changes) return Response.json({ ok: false, code: 'TICKET_INVALID' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const saved = await saveTaskmarketWallet(env, body?.files, { vaults });
    return Response.json({ ok: true, address: saved.address, legal_receipt: saved.legal_receipt });
  } catch (error) {
    return Response.json({ ok: false, code: String(error?.message || 'IMPORT_FAILED').slice(0, 80) }, { status: error?.status || 400 });
  }
}
