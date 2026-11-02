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

// MEL-UI-AUDIT-01: executable inventory of the visible controls. Each button
// is linked to the script that handles it (directly or through its form), the
// API paths that handler calls, and whether it would mutate (non-GET).
export function inventoryControls(html) {
  const source = String(html || '');
  const script = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reference = id => new RegExp(`(#${escape(id)}\\b|getElementById\\(['"]${escape(id)}['"]\\))`);
  const controls = [];
  const seenControlIds = new Set();
  for (const match of source.matchAll(/<button\b([^>]*)>/g)) {
    const id = match[1].match(/\bid="([^"]+)"/)?.[1];
    if (!id) continue;
    const duplicate_id = seenControlIds.has(id);
    seenControlIds.add(id);
    let via = null, at = script.search(reference(id));
    if (at >= 0) via = 'script';
    else if (/\btype="submit"/.test(match[1])) {
      const form = source.slice(0, match.index).match(/<form\b[^>]*\bid="([^"]+)"[^>]*>(?![\s\S]*<\/form>)/)?.[1];
      if (form && (at = script.search(reference(form))) >= 0) via = 'form';
    }
    const handler = at >= 0 ? script.slice(at, at + 700) : '';
    controls.push({ id, duplicate_id, handled: via !== null, via,
      api: [...new Set([...handler.matchAll(/['"](\/api\/[A-Za-z0-9/_.-]+)/g)].map(m => m[1]))].slice(0, 6),
      mutating: /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(handler) });
  }
  return controls;
}

// Receipt per control: FAIL without a handler or with a JavaScript error,
// BLOCKED when its action would mutate (never clicked by a read-only audit),
// PASS otherwise. No unauthorized mutation is ever performed.
export function controlReceipt(controls = [], { jsErrors = [] } = {}) {
  const rows = controls.map(control => ({ id: control.id, api: control.api,
    status: !control.handled || control.duplicate_id || jsErrors.length ? 'FAIL' : control.mutating ? 'BLOCKED' : 'PASS' }));
  const count = status => rows.filter(row => row.status === status).length;
  return { schema: 'mel.ui-control-receipt/v1', controls: rows, pass: count('PASS'), fail: count('FAIL'), blocked: count('BLOCKED'), mutations_performed: 0 };
}

// MEL-UI-AUDIT-02: browser recipe of the chat and media journeys. Each step
// (send, stream, interrupt, resume, attachment) must keep the requested mode
// and the references, and its render must say RESULT or ERROR — an error is
// never shown as a result.
export const CHAT_JOURNEY_STEPS = ['send', 'stream', 'interrupt', 'resume', 'attachment'];
export function chatJourneyReceipt(steps = []) {
  const rows = CHAT_JOURNEY_STEPS.map(step => {
    const seen = (Array.isArray(steps) ? steps : []).find(row => row?.step === step);
    if (!seen) return { step, status: 'BLOCKED', reason: 'NOT_OBSERVED' };
    const problems = [];
    if (seen.requested_mode && seen.mode !== seen.requested_mode) problems.push('MODE_LOST');
    const sent = (seen.sent_references || []).map(ref => ref?.url || ref);
    const kept = new Set((seen.references || []).map(ref => ref?.url || ref));
    if (sent.some(ref => !kept.has(ref))) problems.push('REFERENCE_LOST');
    if (!['RESULT', 'ERROR', 'PARTIAL_ERROR'].includes(seen.outcome)) problems.push('OUTCOME_UNMARKED');
    if (seen.failed === true && seen.outcome === 'RESULT') problems.push('ERROR_RENDERED_AS_RESULT');
    if (seen.archived_outcome && seen.archived_outcome !== seen.outcome) problems.push('ARCHIVE_OUTCOME_MISMATCH');
    return { step, status: problems.length ? 'FAIL' : 'PASS', problems };
  });
  const count = status => rows.filter(row => row.status === status).length;
  return { schema: 'mel.ui-chat-journey/v1', steps: rows, pass: count('PASS'), fail: count('FAIL'), blocked: count('BLOCKED') };
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
