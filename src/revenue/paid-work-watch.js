// Hourly, no model: find paid-work places other than Taskmarket.
// A README or an issue is a lead, not money. Nothing is submitted or paid here.
import { discoverGithubBounties } from './github-bounty-discovery.js';
import { isUnsafeRevenueSource } from './revenue-watch.js';

const SEARCH = 'https://api.github.com/search/repositories';
const QUERIES = Object.freeze([
  'bounty marketplace payout API in:readme',
  'agent task marketplace USDC submission in:readme',
  'algora OR opire OR issuehunt bounty payout in:readme',
]);
const PAY = /bounty|payout|usdc|reward|paid/i;
const NEEDS_OWNER = /\b(api key|compte|account|log ?in|sign ?up|oauth|inscription)\b/i;
const MAX_CONNECTORS_PER_RUN = 3;

async function ensureTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS revenue_watch (url TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEW')").run();
}

export async function watchPaidAlternatives(env, { fetchImpl = fetch, now = new Date(), githubDiscovery = discoverGithubBounties, install = null, askOwner = null } = {}) {
  if (!env?.DB?.prepare) return { status: 'RUNTIME_UNAVAILABLE', found: 0, fresh: 0 };
  await ensureTable(env.DB);
  const today = now.toISOString().slice(0, 10);
  const leads = new Map();
  const errors = [];
  const github = await githubDiscovery({ fetchImpl, now }).catch(() => ({ opportunities: [], errors: ['GITHUB_DISCOVERY_FAILED'] }));
  for (const item of github.opportunities || []) leads.set(item.url, item);
  errors.push(...(github.errors || []));
  for (const query of QUERIES) {
    try {
      const response = await fetchImpl(SEARCH + '?q=' + encodeURIComponent(query) + '&sort=updated&per_page=5', {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'MEL-WORK-Discovery' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) { errors.push('PLATFORM_HTTP_' + response.status); continue; }
      const data = await response.json();
      for (const repo of Array.isArray(data?.items) ? data.items : []) {
        const url = String(repo?.html_url || '');
        const text = String(repo?.description || '') + ' ' + String(repo?.name || '');
        if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(url) || !PAY.test(text)) continue;
        const lead = { name: String(repo.full_name || repo.name || url).slice(0, 120), url, type: 'marketplace', automation: 'semi',
          summary: text.slice(0, 300),
          how_mel_earns: 'Plateforme ou dépôt public autre que Taskmarket. Piste seulement : pas de remise ni de paiement tant que le connecteur n’existe pas.',
          score: 30, provider: 'github-platform', verified_payment: false, status: 'DISCOVERY_ONLY', observed_at: now.toISOString() };
        if (!isUnsafeRevenueSource(lead)) leads.set(url, lead);
      }
    } catch { errors.push('PLATFORM_FETCH_FAILED'); }
  }
  let fresh = 0;
  for (const lead of leads.values()) {
    const existing = await env.DB.prepare('SELECT url FROM revenue_watch WHERE url=?').bind(lead.url).first();
    if (existing) await env.DB.prepare("UPDATE revenue_watch SET last_seen=?, data=? WHERE url=?").bind(today, JSON.stringify(lead), lead.url).run();
    else {
      await env.DB.prepare("INSERT INTO revenue_watch (url, first_seen, last_seen, data, status) VALUES (?,?,?,?, 'DISCOVERY_ONLY')").bind(lead.url, today, today, JSON.stringify(lead)).run();
      fresh += 1;
    }
  }
  const connectors = [];
  const asked = [];
  let handed = 0;
  for (const lead of leads.values()) {
    if (handed >= MAX_CONNECTORS_PER_RUN || lead.type !== 'marketplace') continue;
    const row = await env.DB.prepare('SELECT status FROM revenue_watch WHERE url=?').bind(lead.url).first();
    if (!row || !['NEW', 'DISCOVERY_ONLY'].includes(row.status)) continue;
    handed += 1;
    if (install) connectors.push(await install(env, lead.url).catch(error => ({ status: 'INSTALL_FAILED', error: String(error?.code || error?.message || '').slice(0, 120) })));
    if (askOwner && NEEDS_OWNER.test(`${lead.name} ${lead.summary || ''}`)) {
      await askOwner(env.DB, lead).catch(() => null);
      asked.push(lead.url);
    }
  }
  return { status: 'DONE', found: leads.size, fresh, connectors: connectors.length, asked, errors };
}
