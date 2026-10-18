#!/usr/bin/env node
// Put or delete one secret on the production Worker through the Cloudflare API.
// Used by CI for short-lived tokens. Independent of the Wrangler config, and on
// failure it prints Cloudflare's own error (never the secret value).
//   printf '%s' "$VALUE" | node scripts/cf-worker-secret.mjs put NAME
//   node scripts/cf-worker-secret.mjs delete NAME
import { readFileSync } from 'node:fs';

const [action, name, script = process.env.MEL_WORKER_NAME || 'meliturgos'] = process.argv.slice(2);
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!['put', 'delete'].includes(action) || !/^[A-Z][A-Z0-9_]{1,63}$/.test(name || '')) {
  console.error('usage: cf-worker-secret.mjs put|delete NAME [WORKER]');
  process.exit(2);
}
if (!token || !account) { console.error('::error::CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required'); process.exit(2); }

const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${encodeURIComponent(script)}/secrets`;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
let response;
if (action === 'put') {
  const text = readFileSync(0, 'utf8');
  if (!text) { console.error('::error::empty secret value'); process.exit(2); }
  response = await fetch(base, { method: 'PUT', headers, body: JSON.stringify({ name, text, type: 'secret_text' }) });
} else {
  response = await fetch(`${base}/${name}`, { method: 'DELETE', headers });
}
const body = await response.json().catch(() => ({}));
if (!response.ok || body?.success === false) {
  const errors = (body?.errors || []).map(e => `${e.code}: ${e.message}`).join(' | ') || `HTTP_${response.status}`;
  console.error(`::error title=Worker secret ${action} failed::${name} on ${script}: ${errors}`);
  process.exit(1);
}
console.log(`Worker secret ${action} OK: ${name} on ${script}`);
