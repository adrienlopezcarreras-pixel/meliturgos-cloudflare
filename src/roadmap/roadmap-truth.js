// Vérité de la roadmap : chaque élément « DONE_VERIFIED » est confronté aux
// exécutions réelles en production des capacités qui le prouvent.
//
// Avant : 133/133 éléments affichés « DONE_VERIFIED » (statut écrit dans le
// code) alors que MEL ne répondait pas à un « bonjour ». Désormais le statut
// réel vient de audit_logs (exécutions CapabilityBus) et de computer_commands
// (actions réellement exécutées sur le PC), sur une fenêtre de 7 jours.

import { isAcceptedRoadmapCodeJob } from './roadmap-code-acceptance.js';

export const ROADMAP_TRUTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Élément de roadmap → preuves runtime. Un élément sans entrée ici n'a pas de
// preuve automatique : il est affiché « DÉCLARÉ » et ne compte pas comme vérifié.
export const ROADMAP_PROOF_SOURCES = Object.freeze({
  'GEN2-06': { capabilities: ['conversation.list', 'conversation.get'] },
  'GEN2-08': { capabilities: ['conversation.messages.list'] },
  'MEL-CONTEXT-03': { capabilities: ['openloop.resume', 'openloop.due'] },
  'GEN2-09': { capabilities: ['memory.status', 'memory.retrieve'] },
  'GEN2-12': { capabilities: ['timeline.list'] },
  'GEN2-13': { capabilities: ['project.list', 'decision.list'] },
  'GEN2-25': { capabilities: ['knowledge.search'] },
  'GEN2-56': { capabilities: ['chatgpt.history.search', 'chatgpt.archive.preview'] },
  'MEL-MEM-03': { capabilities: ['memory.export.verify'] },
  'GEN2-14': { capabilities: ['echo', 'skill.list'] },
  'MEL-CODE-01': { capabilities: ['code.read'] },
  'MEL-CODE-02': { capabilities: ['code.search'] },
  'MEL-CODE-03': { capabilities: ['code.integrity'] },
  'MEL-AUG-01': { capabilities: ['augmentio.fanout'] },
  'GEN2-05': { capabilities: ['model.council'] },
  'MEL-COUNCIL-02': { capabilities: ['model.council'] },
  'MEL-EVOL-01': { capabilities: ['evolution.gap.detect'] },
  'MEL-EVOL-02': { capabilities: ['evolution.module.propose'] },
  'MEL-EVOL-04': { capabilities: ['evolution.ledger.verify'] },
  'MEL-EVOL-05': { capabilities: ['skill.list', 'skill.snapshot.export'] },
  'GEN2-20': { capabilities: ['lesson.list'] },
  'MEL-WORK-01': { capabilities: ['work.list', 'work.open'] },
  'GEN2-38': { capabilities: ['work.plan', 'work.plan.list'] },
  'MEL-WORK-02': { capabilities: ['work.plan.save', 'work.plan.get'] },
  'GEN2-40': { capabilities: ['event.list'] },
  'GEN2-33': { capabilities: ['gmail.messages.search', 'calendar.events.read', 'tasks.tasklists.read', 'drive.files.list'] },
  'GEN2-34': { capabilities: ['mail.messages.search'] },
  'GEN2-35': { capabilities: ['files.list'] },
  'GEN2-36': { capabilities: ['cloudflare.workers.read', 'cloudflare.deployments.read', 'github.actions.workflow.dispatch.status'] },
  'GEN2-37': { capabilities: ['web.research'] },
  'GEN2-21': { capabilities: ['media.image.analyze', 'media.image.generate'] },
  'GEN2-22': { capabilities: ['media.audio.transcribe', 'media.audio.synthesize'] },
  'GEN2-23': { capabilities: ['media.video.analyze'] },
  'MEL-MEDIA-02': { capabilities: ['media.image.analyze', 'media.image.process', 'media.image.generate', 'media.audio.transcribe', 'media.audio.synthesize', 'media.audio.analyze', 'media.audio.generate', 'media.music.analyze', 'media.music.generate', 'media.video.analyze', 'media.video.process', 'media.video.generate'] },
  'GEN2-28': { computerActions: ['system.info', 'process.list', 'screen.capture'] },
  'GEN2-30': { computerActions: ['pointer.click', 'keyboard.type', 'ui.snapshot'] },
  'MEL-DEVICE-01': { computerActions: ['app.open', 'app.close'] },
  'GEN2-31': { capabilities: ['browser.execute'] },
  'GEN2-44': { capabilities: ['system.integrity', 'system.bindings'] },
  'GEN2-55': { capabilities: ['system.maturity'] },
  'MEL-AUDIT-01': { capabilities: ['self.audit.status', 'self.audit.run'] },
  'GEN2-48': { capabilities: ['resilience.recovery.drill.latest'] },
  'MEL-RES-03': { capabilities: ['portability.escape.plan'] },
  'MEL-RES-04': { capabilities: ['resilience.cold-standby.prepare.latest'] },
  'GEN2-60': { capabilities: ['roadmap.read'] },
  'GEN2-62': { capabilities: ['roadmap.human-actions-required'] },
  'MEL-UI-07': { capabilities: ['presentation.layout.plan'] },
  'GEN2-42': { capabilities: ['capability.audit'] },
});

export const ROADMAP_TRUTH = Object.freeze({
  VERIFIED_LIVE: 'VERIFIED_LIVE',   // toutes les preuves ont réussi en production sur 7 jours
  PARTIAL_LIVE: 'PARTIAL_LIVE',     // une partie seulement a réussi
  BROKEN: 'BROKEN',                 // des exécutions, aucune réussite récente
  UNPROVEN: 'UNPROVEN',             // jamais exécuté en production sur 7 jours
  DECLARED: 'DECLARED',             // aucune preuve automatique définie
});

async function capabilityEvidence(db, since) {
  const rows = (await db.prepare(
    `SELECT json_extract(details_json,'$.capability') AS cap,
            SUM(json_extract(details_json,'$.status')='SUCCEEDED') AS ok,
            SUM(json_extract(details_json,'$.status')='FAILED') AS ko,
            MAX(CASE WHEN json_extract(details_json,'$.status')='SUCCEEDED' THEN created_at END) AS last_ok,
            MAX(CASE WHEN json_extract(details_json,'$.status')='FAILED' THEN created_at END) AS last_ko,
            MAX(CASE WHEN json_extract(details_json,'$.status')='FAILED' THEN json_extract(details_json,'$.error_code') END) AS error
       FROM audit_logs WHERE action='capability_bus' AND created_at > ? GROUP BY cap`
  ).bind(since).all())?.results || [];
  return new Map(rows.map(r => [String(r.cap), { ok: Number(r.ok || 0), ko: Number(r.ko || 0), last_ok: r.last_ok ? Number(r.last_ok) : null, last_ko: r.last_ko ? Number(r.last_ko) : null, error: r.error || null }]));
}

async function computerEvidence(db, since) {
  try {
    const rows = (await db.prepare(
      `SELECT json_extract(plan_json,'$.steps[0].action') AS action,
              SUM(status='SUCCEEDED') AS ok, SUM(status='FAILED') AS ko,
              MAX(CASE WHEN status='SUCCEEDED' THEN finished_at END) AS last_ok,
              MAX(CASE WHEN status='FAILED' THEN finished_at END) AS last_ko,
              MAX(CASE WHEN status='FAILED' THEN error_code END) AS error
         FROM computer_commands WHERE created_at > ? GROUP BY action`
    ).bind(since).all())?.results || [];
    // Multi-step commands (cursor.move + pointer.click) record their first step; count every step action too.
    const steps = (await db.prepare(
      `SELECT plan_json, status, finished_at FROM computer_commands WHERE created_at > ? AND status='SUCCEEDED' AND json_array_length(json_extract(plan_json,'$.steps')) > 1 LIMIT 500`
    ).bind(since).all())?.results || [];
    const map = new Map(rows.map(r => [String(r.action), { ok: Number(r.ok || 0), ko: Number(r.ko || 0), last_ok: r.last_ok ? Number(r.last_ok) : null, last_ko: r.last_ko ? Number(r.last_ko) : null, error: r.error || null }]));
    for (const row of steps) {
      let plan = null;
      try { plan = JSON.parse(row.plan_json); } catch {}
      for (const step of Array.isArray(plan?.steps) ? plan.steps.slice(1) : []) {
        const entry = map.get(String(step?.action)) || { ok: 0, ko: 0, last_ok: null, last_ko: null, error: null };
        entry.ok += 1;
        entry.last_ok = Math.max(entry.last_ok || 0, Number(row.finished_at || 0)) || entry.last_ok;
        map.set(String(step?.action), entry);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

// A roadmap code objective that MAX delivered and that passed the full
// acceptance gate (Council, exact-SHA full CI, code receipt) is proven by that
// receipt. 30/10: FOUNDER-01 COMPLETED with a verified receipt still showed
// « Déclaré, sans preuve » because only runtime capabilities were read.
async function deliveredRoadmapEvidence(db) {
  try {
    const rows = (await db.prepare(
      `SELECT id, status, requested_by, files_json, optional_context, result_json, updated_at FROM dev_jobs
        WHERE status='COMPLETED' AND requested_by='mel-autonomy' AND result_json LIKE '%roadmap_code_acceptance%'
        ORDER BY updated_at DESC LIMIT 200`
    ).all())?.results || [];
    const parse = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value || 'null'); } catch { return null; } };
    const delivered = new Map();
    for (const row of rows) {
      const job = { ...row, files_json: parse(row.files_json) || [], optional_context: parse(row.optional_context) || {}, result_json: parse(row.result_json) || {} };
      const id = job.optional_context?.roadmap_id;
      if (!id || delivered.has(id) || !isAcceptedRoadmapCodeJob(job)) continue;
      const proof = job.result_json.roadmap_code_acceptance;
      delivered.set(id, { kind: 'max-delivery', id: 'full-candidate-ci#' + proof.ci_run_id, ok: 1, ko: 0,
        last_ok: Number(row.updated_at) || null, last_ko: null, error: null, candidate_sha: proof.candidate_sha, job_id: job.id });
    }
    return delivered;
  } catch {
    return new Map();
  }
}

export function classifyRoadmapItem(itemId, evidence) {
  const delivery = evidence.delivered?.get(itemId);
  if (delivery) return { truth: ROADMAP_TRUTH.VERIFIED_LIVE, last_proof_at: delivery.last_ok ? new Date(delivery.last_ok).toISOString() : null, proofs: [delivery] };
  const source = ROADMAP_PROOF_SOURCES[itemId];
  if (!source) return { truth: ROADMAP_TRUTH.DECLARED, proofs: [] };
  const proofs = [
    ...(source.capabilities || []).map(id => ({ kind: 'capability', id, ...(evidence.capabilities.get(id) || { ok: 0, ko: 0, last_ok: null, last_ko: null, error: null }) })),
    ...(source.computerActions || []).map(id => ({ kind: 'computer', id, ...(evidence.computer.get(id) || { ok: 0, ko: 0, last_ok: null, last_ko: null, error: null }) })),
  ];
  const proven = proofs.filter(p => p.ok > 0);
  const executed = proofs.filter(p => p.ok > 0 || p.ko > 0);
  let truth = ROADMAP_TRUTH.UNPROVEN;
  if (proofs.length && proven.length === proofs.length) truth = ROADMAP_TRUTH.VERIFIED_LIVE;
  else if (proven.length) truth = ROADMAP_TRUTH.PARTIAL_LIVE;
  else if (executed.length) truth = ROADMAP_TRUTH.BROKEN;
  const lastProof = proven.reduce((max, p) => Math.max(max, p.last_ok || 0), 0) || null;
  return { truth, last_proof_at: lastProof ? new Date(lastProof).toISOString() : null, proofs };
}

export async function computeRoadmapTruth(db, phases, { now = Date.now() } = {}) {
  if (!db || typeof db.prepare !== 'function') return { available: false, reason: 'ROADMAP_TRUTH_DB_UNAVAILABLE' };
  const since = now - ROADMAP_TRUTH_WINDOW_MS;
  const evidence = { capabilities: await capabilityEvidence(db, since), computer: await computerEvidence(db, since), delivered: await deliveredRoadmapEvidence(db) };
  const items = {};
  const counts = Object.fromEntries(Object.values(ROADMAP_TRUTH).map(k => [k, 0]));
  let total = 0;
  for (const phase of Array.isArray(phases) ? phases : []) {
    for (const item of Array.isArray(phase?.items) ? phase.items : []) {
      const result = classifyRoadmapItem(item.id, evidence);
      items[item.id] = result;
      counts[result.truth] += 1;
      total += 1;
    }
  }
  return {
    available: true,
    window_days: 7,
    computed_at: new Date(now).toISOString(),
    total,
    counts,
    verified_live_percent: total ? Math.round((counts.VERIFIED_LIVE / total) * 100) : 0,
    items,
  };
}
