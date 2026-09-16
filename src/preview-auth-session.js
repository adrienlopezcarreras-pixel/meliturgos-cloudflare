const PREVIEW_SESSION_COOKIE = 'mel_preview_session';
const PREVIEW_SESSION_TTL_SECONDS = 12 * 60 * 60;
const PREVIEW_SESSION_PURPOSE = 'mel-preview-session-v1';
const textEncoder = new TextEncoder();

function withoutTerminalNewline(value) {
  return String(value ?? '').replace(/[\r\n]+$/g, '');
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualText(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function hmacHex(secret, payload) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error('WEB_CRYPTO_UNAVAILABLE');
  const key = await cryptoApi.subtle.importKey(
    'raw',
    textEncoder.encode(withoutTerminalNewline(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await cryptoApi.subtle.sign('HMAC', key, textEncoder.encode(String(payload)));
  return bytesToHex(new Uint8Array(signature));
}

export function isPreviewEnvironment(env = {}) {
  return String(env.MEL_RUNTIME_ENV || '').trim().toLowerCase() === 'preview'
    && String(env.MEL_PREVIEW_ISOLATED || '').trim().toLowerCase() === 'true';
}

export function isBasicAuthorization(value) {
  return /^Basic\s+\S+/i.test(String(value || ''));
}

export function isBearerAuthorization(value) {
  return /^Bearer\s+\S+/i.test(String(value || ''));
}

export function basicAuthorizationFromCredentials(username, password) {
  const raw = `${String(username ?? '')}:${String(password ?? '')}`;
  const bytes = textEncoder.encode(raw);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof globalThis.btoa !== 'function') throw new Error('BTOA_UNAVAILABLE');
  return `Basic ${globalThis.btoa(binary)}`;
}

export function readCookie(request, name) {
  const cookieHeader = request?.headers?.get?.('cookie') || '';
  for (const part of String(cookieHeader).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return '';
}

export async function createPreviewSessionToken(localPassword, nowMs = Date.now()) {
  const secret = withoutTerminalNewline(localPassword);
  if (!secret) throw new Error('PREVIEW_SECRET_MISSING');
  const issuedAt = Math.floor(Number(nowMs) / 1000);
  const signature = await hmacHex(secret, `${PREVIEW_SESSION_PURPOSE}:${issuedAt}`);
  return `${issuedAt}.${signature}`;
}

export async function verifyPreviewSessionToken(token, localPassword, nowMs = Date.now()) {
  const secret = withoutTerminalNewline(localPassword);
  if (!secret) return false;
  const match = String(token || '').match(/^(\d{10})\.([a-f0-9]{64})$/i);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  const nowSeconds = Math.floor(Number(nowMs) / 1000);
  const age = nowSeconds - issuedAt;
  if (!Number.isFinite(age) || age < -60 || age > PREVIEW_SESSION_TTL_SECONDS) return false;
  const expected = await hmacHex(secret, `${PREVIEW_SESSION_PURPOSE}:${issuedAt}`);
  return timingSafeEqualText(expected, match[2].toLowerCase());
}

export async function requestHasValidPreviewSession(request, localPassword, nowMs = Date.now()) {
  const token = readCookie(request, PREVIEW_SESSION_COOKIE);
  if (!token) return false;
  try {
    return await verifyPreviewSessionToken(token, localPassword, nowMs);
  } catch {
    return false;
  }
}

export function previewSessionSetCookie(token) {
  return `${PREVIEW_SESSION_COOKIE}=${String(token)}; Path=/; Max-Age=${PREVIEW_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function previewSessionClearCookie() {
  return `${PREVIEW_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function withPreviewLocalBearer(request, localPassword) {
  const secret = withoutTerminalNewline(localPassword);
  if (!secret) return request;
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${secret}`);
  return new Request(request, { headers });
}

export async function verifyBasicAgainstProduction(request, env = {}, fetchImpl = globalThis.fetch) {
  if (!isPreviewEnvironment(env) || typeof fetchImpl !== 'function') return false;
  const authorization = request?.headers?.get?.('authorization') || '';
  if (!isBasicAuthorization(authorization)) return false;

  const configuredVerifier = String(env.MEL_PREVIEW_AUTH_VERIFY_URL || '').trim();
  if (!configuredVerifier) return false;

  let verifier;
  let requestOrigin;
  try {
    verifier = new URL(configuredVerifier);
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  if (verifier.protocol !== 'https:' || verifier.origin === requestOrigin) return false;

  try {
    const verification = await fetchImpl(verifier.toString(), {
      method: 'GET',
      headers: {
        authorization,
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      cache: 'no-store',
    });
    const accepted = verification.status >= 200 && verification.status < 300;
    if (accepted && verification.url) {
      let finalOrigin = '';
      try { finalOrigin = new URL(verification.url).origin; } catch { return false; }
      if (finalOrigin !== verifier.origin) return false;
    }
    try { await verification.body?.cancel(); } catch {}
    return accepted;
  } catch {
    return false;
  }
}

export const previewSessionConstants = Object.freeze({
  cookieName: PREVIEW_SESSION_COOKIE,
  ttlSeconds: PREVIEW_SESSION_TTL_SECONDS,
});
