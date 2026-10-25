#!/usr/bin/env node
// Reads the last minutes of Workers Logs for the production Worker and prints
// only outcomes and bounded error messages (no request bodies, no headers).
const minutes = Math.max(5, Math.min(1440, Number(process.env.MINUTES) || 120));
const to = Date.now();
const from = to - minutes * 60_000;
const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/observability/telemetry/query`;
const body = {
  queryId: 'claude-ops-worker-errors',
  timeframe: { from, to },
  view: 'events',
  limit: 2000,
  parameters: {
    filters: [{ key: '$metadata.service', operation: 'eq', type: 'string', value: process.env.WORKER_NAME || 'meliturgos' }],
  },
};
const res = await fetch(url, {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const json = await res.json().catch(() => ({}));
if (!res.ok || json.success === false) {
  console.log(JSON.stringify({ ok: false, http: res.status, errors: (json.errors || []).map(e => String(e.message || e.code).slice(0, 200)) }));
  process.exit(1);
}
const events = json.result?.events?.events || [];
const clip = v => String(v ?? '').replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').slice(0, 200);
const outcomes = {};
const errors = {};
for (const e of events) {
  const w = e.$workers || {};
  const key = `${w.eventType || '?'}:${w.outcome || '?'}`;
  outcomes[key] = (outcomes[key] || 0) + 1;
  const level = String(e.$metadata?.level || '').toLowerCase();
  if (level === 'error' || (w.outcome && w.outcome !== 'ok')) {
    const msg = `${key} ${clip(e.$metadata?.error || e.$metadata?.message)}`;
    errors[msg] = (errors[msg] || 0) + 1;
  }
}
const top = Object.entries(errors).sort((a, b) => b[1] - a[1]).slice(0, 40);
console.log(JSON.stringify({ ok: true, minutes, events: events.length, outcomes, top_errors: top }, null, 1));
