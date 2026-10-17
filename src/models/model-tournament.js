// MEL model evolution: every night the free models compete on MEL's own tasks
// (exact answer, numbered plan, reading a long text), and the chat uses the
// winner first. New candidates can be added without code through
// MEL_MODEL_CANDIDATES (comma-separated @cf ids, free-tier models only).
// Cost stays small: three short tests per model (≈600 neurons per night).

import { extractModelText } from './ModelRouter.js';
import { STREAM_MODELS } from '../api/chat-stream.js';

const TESTS = Object.freeze([
  { id: 'exact', expect: /\b391\b/, messages: [{ role: 'user', content: 'Combien font 17 × 23 ? Réponds uniquement par le nombre.' }] },
  { id: 'plan', expect: /(^|\n)\s*(?:\*\*)?(?:étape\s*)?4[.)\s]/im, messages: [{ role: 'user', content: 'Donne un plan en 4 étapes numérotées (1. 2. 3. 4.) pour apprendre une langue en 3 mois. Une ligne par étape.' }] },
  { id: 'long', expect: /VIOLETTE-58/i, messages: [{ role: 'user', content: longText() }] },
]);

function longText() {
  const parts = [];
  for (let i = 1; i <= 60; i += 1) {
    parts.push(`Paragraphe ${i} : compte rendu de réunion, décisions mineures, suivi des actions et calendrier inchangé.${i === 37 ? ' Le mot de passe du coffre est VIOLETTE-58.' : ''}`);
  }
  return parts.join('\n') + '\n\nQuel est le mot de passe du coffre mentionné plus haut ? Réponds seulement par le mot de passe.';
}

export function tournamentCandidates(env = {}) {
  const extra = String(env.MEL_MODEL_CANDIDATES || '').split(',').map(s => s.trim()).filter(id => /^@cf\/[a-z0-9_.-]+\/[a-z0-9_.:-]+$/i.test(id));
  return [...new Set([...STREAM_MODELS.map(m => m.id), ...extra])].slice(0, 8);
}

async function ensureTable(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS model_tournament (run_at INTEGER NOT NULL, model TEXT NOT NULL, score REAL NOT NULL, passed INTEGER NOT NULL, total INTEGER NOT NULL, avg_ms INTEGER, details TEXT, PRIMARY KEY (run_at, model))').run();
}

export async function runModelTournament(env, { now = () => Date.now(), models = tournamentCandidates(env) } = {}) {
  if (!env?.DB?.prepare || typeof env?.AI?.run !== 'function') return { status: 'RUNTIME_UNAVAILABLE' };
  await ensureTable(env.DB);
  const runAt = now();
  const results = [];
  for (const model of models) {
    const details = [];
    for (const test of TESTS) {
      const started = now();
      let text = '';
      let error = null;
      try { text = extractModelText(await env.AI.run(model, { messages: test.messages, max_tokens: 600 })) || ''; }
      catch (e) { error = String(e?.code || e?.message || 'FAILED').slice(0, 80); }
      details.push({ test: test.id, passed: !error && test.expect.test(text), ms: now() - started, error });
    }
    const passed = details.filter(d => d.passed).length;
    const avgMs = Math.round(details.reduce((s, d) => s + d.ms, 0) / details.length);
    // Correctness dominates; speed only separates equally correct models.
    const score = passed * 1000 - Math.min(999, Math.round(avgMs / 100));
    results.push({ model, score, passed, total: TESTS.length, avg_ms: avgMs });
    await env.DB.prepare('INSERT OR REPLACE INTO model_tournament (run_at,model,score,passed,total,avg_ms,details) VALUES (?,?,?,?,?,?,?)')
      .bind(runAt, model, score, passed, TESTS.length, avgMs, JSON.stringify(details)).run();
  }
  results.sort((a, b) => b.score - a.score);
  return { status: 'DONE', run_at: runAt, ranking: results };
}

let cache = null;
// Latest ranking (cached 10 minutes). Models that passed nothing are dropped;
// unknown models keep their static order after the ranked ones.
export async function rankedStreamModels(env, { now = () => Date.now() } = {}) {
  const fallback = STREAM_MODELS.map(m => m.id);
  if (cache && now() - cache.at < 600_000) return cache.order;
  let order = fallback;
  try {
    const last = await env.DB.prepare('SELECT MAX(run_at) AS r FROM model_tournament').first();
    if (last?.r) {
      const rows = (await env.DB.prepare('SELECT model, score, passed FROM model_tournament WHERE run_at=? ORDER BY score DESC').bind(last.r).all())?.results || [];
      const ranked = rows.filter(r => r.passed > 0).map(r => r.model);
      const failed = new Set(rows.filter(r => r.passed === 0).map(r => r.model));
      order = [...ranked, ...fallback.filter(id => !ranked.includes(id) && !failed.has(id))];
      if (!order.length) order = fallback;
    }
  } catch {}
  cache = { at: now(), order };
  return order;
}

export function resetRankedModelCache() { cache = null; }
