// x402 v2 (HTTP transport) — MEL sells small services to AI agents, paid per call in USDC.
//
// Spec: github.com/coinbase/x402 specs/x402-specification-v2.md + transports-v2/http.md
//   no PAYMENT-SIGNATURE  -> 402 + PAYMENT-REQUIRED (base64 PaymentRequired)
//   with PAYMENT-SIGNATURE -> facilitator /verify -> do the work -> /settle -> 200 + PAYMENT-RESPONSE
// The client is charged only if the work succeeded (settle happens after it).
// MEL only RECEIVES funds: no private key, no spending path exists here.
//
// Configuration (all public values, no secret required on testnet):
//   X402_PAY_TO           receiving address (0x…). Missing -> service off (fail closed).
//   X402_NETWORK          'eip155:84532' (Base Sepolia, default) or 'eip155:8453' (Base mainnet)
//   X402_FACILITATOR_URL  default https://x402.org/facilitator (testnet). Mainnet needs a
//                         production facilitator (e.g. Coinbase CDP, 1 000 settlements/month free).
//   X402_FACILITATOR_AUTH optional "Bearer …" header for that facilitator (secret, set by the owner).
//   X402_MONTHLY_SETTLE_CAP default 900, keeps a free facilitator tier free.

export const USDC_BY_NETWORK = Object.freeze({
  'eip155:8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base mainnet (coinbase/x402 DEFAULT_ASSETS.md)
  'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia (spec example)
});
const DEFAULT_FACILITATOR = 'https://x402.org/facilitator';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function b64encodeJson(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function b64decodeJson(text) {
  try {
    const binary = atob(String(text || '').trim());
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

export function x402Config(env = {}) {
  const payTo = String(env.X402_PAY_TO || '').trim();
  const network = String(env.X402_NETWORK || 'eip155:84532').trim();
  const asset = USDC_BY_NETWORK[network];
  if (!ADDRESS.test(payTo) || !asset) return null;
  const cap = Number(env.X402_MONTHLY_SETTLE_CAP);
  return {
    payTo, network, asset,
    facilitator: String(env.X402_FACILITATOR_URL || DEFAULT_FACILITATOR).replace(/\/+$/, ''),
    facilitatorAuth: String(env.X402_FACILITATOR_AUTH || '').trim() || null,
    monthlyCap: Number.isSafeInteger(cap) && cap >= 0 ? cap : 900,
  };
}

export function paymentRequirements(config, { amount }) {
  return {
    scheme: 'exact', network: config.network, amount: String(amount), asset: config.asset,
    payTo: config.payTo, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' },
  };
}

export function paymentRequiredResponse({ resource, requirements, error = 'PAYMENT-SIGNATURE header is required' }) {
  const body = { x402Version: 2, error, resource, accepts: [requirements], extensions: {} };
  return new Response(JSON.stringify(body), {
    status: 402,
    headers: { 'content-type': 'application/json', 'payment-required': b64encodeJson(body), 'cache-control': 'no-store', 'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE' },
  });
}

// The client must pay exactly what we ask, to us, on our network, in our asset.
export function acceptedMatches(accepted, requirements) {
  if (!accepted || typeof accepted !== 'object') return false;
  return accepted.scheme === requirements.scheme
    && accepted.network === requirements.network
    && String(accepted.amount) === requirements.amount
    && String(accepted.asset).toLowerCase() === requirements.asset.toLowerCase()
    && String(accepted.payTo).toLowerCase() === requirements.payTo.toLowerCase();
}

async function facilitatorCall(config, path, paymentPayload, requirements, fetchImpl) {
  const headers = { 'content-type': 'application/json' };
  if (config.facilitatorAuth) headers.authorization = config.facilitatorAuth;
  const response = await fetchImpl(config.facilitator + path, {
    method: 'POST', headers, signal: AbortSignal.timeout(path === '/settle' ? 30_000 : 10_000),
    body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: requirements }),
  });
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object') throw new Error('X402_FACILITATOR_UNREADABLE');
  return data;
}

async function ensureSalesTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS x402_sales (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, product TEXT NOT NULL, network TEXT NOT NULL, amount TEXT NOT NULL, payer TEXT, tx TEXT, status TEXT NOT NULL, error TEXT)').run();
}

export async function monthlySettled(db, now = Date.now()) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const row = await db.prepare("SELECT COUNT(*) AS n FROM x402_sales WHERE status='SETTLED' AND created_at>=?").bind(start).first();
  return Number(row?.n || 0);
}

async function recordSale(db, sale) {
  try {
    await db.prepare('INSERT INTO x402_sales (id,created_at,product,network,amount,payer,tx,status,error) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), sale.now, sale.product, sale.network, sale.amount, sale.payer || null, sale.tx || null, sale.status, sale.error || null).run();
  } catch {}
}

/**
 * Wraps a paid product. `work()` returns a Response; the payment is settled only
 * when that Response is 2xx, so a failed job never costs the client anything.
 */
export async function handlePaidRequest({ request, env, product, amount, description, mimeType = 'application/json', work, fetchImpl = fetch, now = () => Date.now() }) {
  const config = x402Config(env);
  if (!config) return Response.json({ ok: false, code: 'X402_NOT_CONFIGURED' }, { status: 503 });
  const url = new URL(request.url);
  const resource = { url: url.origin + url.pathname, description, mimeType, serviceName: 'MEL', tags: ['mel', product] };
  const requirements = paymentRequirements(config, { amount });
  const header = request.headers.get('payment-signature');
  if (!header) return paymentRequiredResponse({ resource, requirements });

  const payload = b64decodeJson(header);
  if (!payload || payload.x402Version !== 2 || !acceptedMatches(payload.accepted, requirements)) {
    return paymentRequiredResponse({ resource, requirements, error: 'Payment does not match the requirements' });
  }
  if (env.DB?.prepare) {
    await ensureSalesTable(env.DB);
    if (await monthlySettled(env.DB, now()) >= config.monthlyCap) return Response.json({ ok: false, code: 'X402_MONTHLY_CAP_REACHED' }, { status: 503, headers: { 'retry-after': '86400' } });
  }

  let verification;
  try { verification = await facilitatorCall(config, '/verify', payload, requirements, fetchImpl); }
  catch { return Response.json({ ok: false, code: 'X402_FACILITATOR_UNAVAILABLE' }, { status: 503 }); }
  if (verification.isValid !== true) {
    return paymentRequiredResponse({ resource, requirements, error: 'Payment invalid: ' + String(verification.invalidReason || 'unknown').slice(0, 80) });
  }

  const result = await work();
  if (!result || result.status < 200 || result.status >= 300) {
    await recordSale(env.DB, { now: now(), product, network: config.network, amount: requirements.amount, payer: verification.payer, status: 'NOT_CHARGED_WORK_FAILED', error: String(result?.status || 'NO_RESULT') });
    return result || Response.json({ ok: false, code: 'X402_WORK_FAILED' }, { status: 500 });
  }

  let settlement;
  try { settlement = await facilitatorCall(config, '/settle', payload, requirements, fetchImpl); }
  catch { settlement = { success: false, errorReason: 'unexpected_settle_error', transaction: '', network: config.network }; }
  if (settlement.success !== true) {
    await recordSale(env.DB, { now: now(), product, network: config.network, amount: requirements.amount, payer: verification.payer, tx: settlement.transaction, status: 'SETTLE_FAILED', error: String(settlement.errorReason || 'unknown').slice(0, 120) });
    return new Response('{}', { status: 402, headers: { 'content-type': 'application/json', 'payment-response': b64encodeJson(settlement), 'cache-control': 'no-store' } });
  }
  await recordSale(env.DB, { now: now(), product, network: config.network, amount: requirements.amount, payer: settlement.payer || verification.payer, tx: settlement.transaction, status: 'SETTLED' });
  const headers = new Headers(result.headers);
  headers.set('payment-response', b64encodeJson(settlement));
  headers.set('access-control-expose-headers', 'PAYMENT-RESPONSE');
  return new Response(result.body, { status: result.status, headers });
}
