#!/usr/bin/env node
// MEL-UI-AUDIT (production, read-only): open MEL's real pages in a browser
// with the exact-SHA release-smoke identity, switch to every panel (a pure
// client-side tab change, never a mutation) and record what the owner would
// see broken: JavaScript errors, API calls failing on the server, and panels
// still stuck on a loading placeholder. API calls the read-only identity may
// not make answer 401/403: they are BLOCKED, never counted as failures.
// Usage: BASE_URL=… MEL_PARALLEL_PROOF=… node scripts/ui-production-audit.mjs > report.json

export const PAGES = ['/', '/professor'];
const PANELS = ['overview', 'chat', 'skills', 'roadmap', 'multi', 'memory', 'lora', 'connections', 'computer', 'diagnostics', 'terminal'];
const LOADING_RE = /^(chargement…?|chargement\.\.\.|lecture de l’état…|vérification…|état à charger…)$/i;
const SETTLE_MS = 6000;
// Requested by every panel; never evidence that a given panel loaded its data.
const SHARED_API = new Set(['/api/learning/progress']);

/** Pure classification, unit-tested: raw browser observations → report. */
export function summarizeUiAudit(observations = []) {
  const findings = [];
  let blocked = 0;
  let stuckBlocked = 0;
  let checked = 0;
  for (const page of observations) {
    for (const error of page.errors || []) findings.push({ code: 'UI_JS_ERROR', detail: `${page.path}${page.panel ? '#' + page.panel : ''} : ${String(error).slice(0, 200)}` });
    for (const call of page.responses || []) {
      checked++;
      if (call.status === 401 || call.status === 403) { blocked++; continue; }
      if (call.status >= 500) findings.push({ code: 'UI_API_SERVER_ERROR', detail: `${page.path} → ${call.method} ${call.path} HTTP ${call.status}` });
    }
    // Production proof 26/10: under the read-only identity most panels never
    // request their own data (only the shared progress call). A placeholder
    // there proves nothing about MEL: it is BLOCKED, not a finding.
    const ownCalls = new Set((page.responses || []).map(call => call.path).filter(path => !SHARED_API.has(path)));
    if (!ownCalls.size) { stuckBlocked += (page.stuck || []).length; continue; }
    for (const id of page.stuck || []) findings.push({ code: 'UI_STUCK_LOADING', detail: `${page.path}#${page.panel || '-'} : #${id} reste en chargement` });
  }
  // One finding per distinct problem, however many panels repeat it.
  const unique = [...new Map(findings.map(row => [row.code + row.detail.replace(/#[a-z-]+ :/, ':'), row])).values()];
  return { schema: 'mel.ui-production-audit/v1', pages: observations.length, api_calls: checked, blocked_calls: blocked, blocked_stuck: stuckBlocked, findings: unique.slice(0, 40) };
}

export async function observe(browser, baseUrl, headers, path, panel) {
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  const page = await context.newPage();
  const errors = [];
  const responses = [];
  const aborted = [];
  // Requests this audit aborts (non-GET) reject as "Failed to fetch"; they
  // are the audit's own read-only guard, not a defect of the page.
  page.on('pageerror', error => { if (!/failed to fetch/i.test(error.message)) errors.push(error.message); });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === new URL(baseUrl).origin && url.pathname.startsWith('/api/')) {
      responses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });
  // Read-only: block any non-GET request the page might start on its own.
  await page.route('**/*', route => {
    if (route.request().method() === 'GET') return route.continue();
    aborted.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
    return route.abort();
  });
  await page.goto(baseUrl + path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (panel) await page.evaluate(view => document.querySelector(`#nav button[data-view="${view}"]`)?.click(), panel);
  await page.waitForTimeout(SETTLE_MS);
  const stuck = await page.evaluate(source => {
    const re = new RegExp(source, 'i');
    const visible = el => el.offsetParent !== null;
    // Only the open panel: header elements depend on loaders this panel never ran.
    const scope = document.querySelector('section.view.active') || document;
    return [...scope.querySelectorAll('[id]')]
      .filter(el => el.children.length === 0 && visible(el) && re.test(el.textContent.trim()))
      .map(el => el.id).slice(0, 20);
  }, LOADING_RE.source);
  await context.close();
  return { path, panel, errors, responses, stuck, aborted };
}

async function main() {
  const baseUrl = String(process.env.BASE_URL || '').replace(/\/$/, '');
  const proof = String(process.env.MEL_PARALLEL_PROOF || '');
  if (!/^https:\/\//.test(baseUrl) || proof.length < 32) throw new Error('UI_AUDIT_CONFIG_MISSING');
  const { chromium } = await import('playwright-core').catch(() => import('playwright'));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const headers = { 'x-mel-release-smoke': '1', 'x-mel-parallel-proof': proof };
  const observations = [];
  try {
    observations.push(await observe(browser, baseUrl, headers, '/', null));
    for (const panel of PANELS) observations.push(await observe(browser, baseUrl, headers, '/professor', panel));
  } finally {
    await browser.close();
  }
  if (process.env.UI_AUDIT_TRACE) console.error(JSON.stringify(observations.map(o => ({ panel: o.panel, responses: o.responses, aborted: o.aborted })), null, 1));
  process.stdout.write(JSON.stringify(summarizeUiAudit(observations), null, 2) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
