// MEL WORK → improvement watch.
//
// Each paid offer MEL had to skip is recorded with the capability it lacked
// (from her own assessment). The capability watch turns the most valuable gaps
// into discoveries of the existing ecosystem pipeline: each one is compared with
// MEL's current capabilities and roadmap, justified by the real offers and USDC
// at stake, and handed to the supervised development queue like any discovery.

import { detectCapabilityGap } from '../evolution/capability-gap-detector.js';
import { proposeModuleDraft } from '../capabilities/module-proposal-capability.js';
import { actionForGap, alternativesOf, roadmapMatches } from '../evaluation/ecosystem-discovery-planner.js';

export const WORK_GAP_WINDOW_DAYS = 14;
const MIN_OFFERS = 2;

async function ensureTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS mel_work_rejections (task_id TEXT PRIMARY KEY, title TEXT, reward_usdc REAL, category TEXT, missing TEXT, reason TEXT, created_at INTEGER NOT NULL)').run();
}

export function normalizeMissingCapability(value) {
  const key = String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.').replace(/^[.-]+|[.-]+$/g, '').slice(0, 48);
  return /^(?:none|aucune?|rien|n\.?a|null)$/.test(key) ? '' : key;
}

/** Remember why a paid offer was skipped (one row per offer). */
export async function recordWorkRejection(db, mission, verdict, { now = Date.now() } = {}) {
  if (!db?.prepare || !mission?.id) return;
  const missing = normalizeMissingCapability(verdict?.missingCapability);
  if (!missing) return;
  let reward = 0;
  try { reward = Number(BigInt(mission.reward)) / 1e6; } catch {}
  try {
    await ensureTable(db);
    await db.prepare('INSERT OR REPLACE INTO mel_work_rejections (task_id,title,reward_usdc,category,missing,reason,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(String(mission.id), String(mission.description || '').split('\n').map(l => l.replace(/^[#\s*>-]+/, '').trim()).find(Boolean)?.slice(0, 120) || '',
        reward, String(verdict?.category || '').slice(0, 80), missing, String(verdict?.reason || '').slice(0, 300), now).run();
  } catch { /* never block a work cycle on bookkeeping */ }
}

/** Discovery items for the capability watch, built from real skipped offers. */
export async function workGapDiscoveries({ db, capabilities = [], now = Date.now(), days = WORK_GAP_WINDOW_DAYS } = {}) {
  if (!db?.prepare) return [];
  let rows = [];
  try {
    await ensureTable(db);
    rows = (await db.prepare('SELECT task_id, title, reward_usdc, missing, reason FROM mel_work_rejections WHERE created_at > ? ORDER BY created_at DESC LIMIT 400').bind(now - days * 86_400_000).all())?.results || [];
  } catch { return []; }
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeMissingCapability(row.missing);
    if (!key) continue;
    const g = groups.get(key) || { key, offers: 0, reward: 0, reasons: [], tasks: [] };
    g.offers += 1;
    g.reward += Number(row.reward_usdc) || 0;
    if (row.reason && g.reasons.length < 3) g.reasons.push(String(row.title ? row.title + ' — ' : '') + row.reason);
    if (g.tasks.length < 5) g.tasks.push(row.task_id);
    groups.set(key, g);
  }
  const items = [];
  for (const g of groups.values()) {
    if (g.offers < MIN_OFFERS) continue;
    const hint = g.key.replace(/[._-]+/g, ' ');
    const gap = detectCapabilityGap({ goal: g.key + ' ' + hint, capabilities, threshold: 1 });
    // A loose match (e.g. image.generate for video.generate) is not a reason to
    // drop a paid gap: it goes to development, whose goal compares with it first.
    const raw = actionForGap(gap);
    const action = raw === 'REVIEW_EXISTING' ? 'PROPOSE_EXTENSION' : raw;
    const draft = action === 'PROPOSE_EXTENSION' ? proposeModuleDraft({ goal: hint, capabilities, threshold: 1 }) : null;
    const proposal = action === 'PROPOSE_EXTENSION'
      ? { decision: draft?.decision || 'PROPOSE', manifest: draft?.manifest || null, acceptance_tests: draft?.acceptance_tests || [], activation_allowed: false }
      : null;
    items.push({
      fingerprint: 'work:' + g.key,
      capability_hint: g.key,
      category: 'mel-work',
      suggested_kind: 'module',
      classification: gap.classification,
      confidence: gap.confidence,
      action,
      optimization_action: action === 'REUSE_EXISTING' ? 'COMPARE_EXISTING_WITH_ALTERNATIVE' : null,
      best_match: gap.best_match,
      alternatives: alternativesOf(gap),
      roadmap_matches: roadmapMatches(hint),
      source_class: 'mel-work',
      verification_policy: 'SOURCE_AND_TEST_BEFORE_INTEGRATION',
      cross_ai: null,
      proposal,
      observed_on: ['mel-work'],
      citations_count: g.offers,
      // The offers themselves are the evidence: public Taskmarket records.
      sources: g.tasks.map(id => ({ title: 'Offre Taskmarket écartée ' + String(id).slice(0, 10) + '…', url: 'https://api.taskmarket.dev/api/tasks/' + id })),
      evidence_status: 'SOURCED_OBSERVATION',
      work_demand: { offers: g.offers, reward_usdc: Math.round(g.reward * 100) / 100, days, reasons: g.reasons },
    });
  }
  return items.sort((a, b) => b.work_demand.reward_usdc - a.work_demand.reward_usdc).slice(0, 8);
}
