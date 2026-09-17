import { MentorMemoryRepository } from './mentor-memory.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { ZeroEuroGovernor } from '../augmentio/zero-euro-governor.js';
import { sanitizeInferenceSettings } from './inference-adaptation.js';

const MAX_FILES = 8;
const MAX_FILE_CHARS = 45_000;
const MAX_TOTAL_SOURCE_CHARS = 150_000;
const MAX_CHANGES = 10;
const MAX_CHANGE_CHARS = 200_000;
const ALLOWED_TESTS = new Set(['test', 'test:mel', 'test:integration', 'test:acceptance', 'test:smoke', 'test:mvp', 'test:routes']);
const DENIED_PATH = /(^|\/)(?:\.git|node_modules|\.wrangler|\.env(?:\.|$)|dev\.vars|secrets?|credentials?)(?:\/|$)|(?:^|[._/-])(?:token|password|api[_-]?key|private[_-]?key)(?:[._/-]|$)/i;
const ALLOWED_TEXT_PATH = /^(?:src|tests|scripts|docs|migrations|\.github)\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|txt|yml|yaml|toml|css|html|sql|sh|ps1)$|^(?:package\.json|wrangler\.jsonc)$/;

function bounded(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) : text;
}

function evidenceObject(row) {
  const value = row?.evidence;
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function safePath(path) {
  const value = String(path || '').trim().replace(/\\/g, '/');
  if (!value || value.startsWith('/') || value.includes('..') || DENIED_PATH.test(value) || !ALLOWED_TEXT_PATH.test(value)) {
    const error = new Error(`MENTOR_PATH_DENIED:${value || 'empty'}`);
    error.code = 'MENTOR_PATH_DENIED';
    throw error;
  }
  return value;
}

function parseJsonCandidate(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) throw Object.assign(new Error('MENTOR_JSON_REQUIRED'), { code: 'MENTOR_JSON_REQUIRED' });
  return JSON.parse(text.slice(first, last + 1));
}

function normalizeInspectedFiles(files = []) {
  let total = 0;
  const out = [];
  for (const item of Array.isArray(files) ? files : []) {
    if (out.length >= MAX_FILES || total >= MAX_TOTAL_SOURCE_CHARS) break;
    const path = safePath(item?.path);
    const remaining = MAX_TOTAL_SOURCE_CHARS - total;
    const content = bounded(item?.content ?? item?.result?.content ?? '', Math.min(MAX_FILE_CHARS, remaining));
    total += content.length;
    out.push({ path, content });
  }
  return out;
}

function normalizeProposal(value, provenance = {}) {
  const parsed = parseJsonCandidate(value);
  const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];
  if (!rawChanges.length) throw Object.assign(new Error('MENTOR_CHANGES_REQUIRED'), { code: 'MENTOR_CHANGES_REQUIRED' });
  const seen = new Set();
  const changes = [];
  for (const raw of rawChanges.slice(0, MAX_CHANGES)) {
    const path = safePath(raw?.path);
    if (seen.has(path)) continue;
    const content = String(raw?.content ?? '');
    if (!content || content.length > MAX_CHANGE_CHARS) throw Object.assign(new Error(`MENTOR_INVALID_CHANGE:${path}`), { code: 'MENTOR_INVALID_CHANGE' });
    seen.add(path);
    changes.push({ path, content, reason: bounded(raw?.reason || '', 1200) });
  }
  if (!changes.length) throw Object.assign(new Error('MENTOR_CHANGES_REQUIRED'), { code: 'MENTOR_CHANGES_REQUIRED' });
  const tests = [...new Set((Array.isArray(parsed.tests) ? parsed.tests : []).map(String).filter(name => ALLOWED_TESTS.has(name)))].slice(0, 4);
  if (!tests.length) tests.push('test:smoke');
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
  const lessons = (Array.isArray(parsed.lessons) ? parsed.lessons : []).map(x => bounded(x, 1200)).filter(Boolean).slice(0, 8);
  return {
    summary: bounded(parsed.summary || parsed.plan || 'Proposition de développement MEL', 4000),
    changes,
    tests,
    confidence,
    lessons,
    risks: (Array.isArray(parsed.risks) ? parsed.risks : []).map(x => bounded(x, 1000)).filter(Boolean).slice(0, 8),
    provenance,
  };
}

function scoreProposal(proposal) {
  return proposal.confidence * 10 + Math.min(5, proposal.changes.length) * 2 + Math.min(3, proposal.tests.length) + Math.min(2, proposal.lessons.length * 0.5);
}

function sourceBlock(files) {
  return files.map(file => `\n===== FILE ${file.path} =====\n${file.content}\n===== END ${file.path} =====`).join('\n');
}

function buildPrompt({ role, goal, files, lessons, experiences, previousAttempts, mode }) {
  return [
    'Tu es un membre du Mentor Council de MELITURGOS chargé de produire du code réellement applicable.',
    `RÔLE INDÉPENDANT: ${role}.`,
    `MODE: ${mode === 'repair' ? 'RÉPARATION APRÈS TEST' : 'IMPLÉMENTATION'}.`,
    'Règle absolue: réponds UNIQUEMENT avec un objet JSON valide, sans markdown.',
    'Le JSON doit avoir exactement cette structure générale:',
    '{"summary":"...","changes":[{"path":"src/...","content":"CONTENU COMPLET DU FICHIER","reason":"..."}],"tests":["test:smoke"],"confidence":0.0,"lessons":["..."],"risks":["..."]}',
    'Chaque change.content doit contenir le FICHIER COMPLET final, jamais un diff, jamais des points de suspension.',
    'Ne modifie pas de secrets, .env, credentials, node_modules, .git ou fichiers privés.',
    'Ne prétends pas qu’un test est passé: tu proposes seulement les tests à exécuter.',
    'Privilégie une modification petite, cohérente et testable qui fait avancer réellement l’objectif.',
    'OBJECTIF UTILISATEUR:', bounded(goal, 12_000),
    'LEÇONS MÉMORISÉES VALIDÉES/OPÉRATIONNELLES DU MENTOR:', JSON.stringify(lessons || []),
    'EXPÉRIENCES VALIDÉES:', JSON.stringify(experiences?.validated || []),
    'OBSERVATIONS ACQUISES NON VALIDÉES — HYPOTHÈSES/SIGNAUX UNIQUEMENT, NE JAMAIS LES TRAITER COMME DES FAITS:', JSON.stringify(experiences?.observations || []),
    'TENTATIVES/ERREURS PRÉCÉDENTES:', JSON.stringify(previousAttempts || []),
    'SOURCES INSPECTÉES:', sourceBlock(files),
  ].join('\n');
}

export class MentorEngine {
  constructor({ memory, providerFactory } = {}) {
    this.memory = memory || new MentorMemoryRepository(null);
    this.providerFactory = providerFactory;
  }

  async _providers(env) {
    if (this.providerFactory) return this.providerFactory(env);
    const pool = createDefaultAugmentioPool(env);
    await pool.refreshHealth();
    const governor = new ZeroEuroGovernor({ maxCost: 0 });
    return pool.list({ capability: 'CODE' }).filter(provider => governor.allows(provider)).slice(0, 3);
  }

  async _learnedRuntime() {
    const [settingsRows, adapterRows] = await Promise.all([
      this.memory.recent({ limit: 1, kind: 'INFERENCE_SETTINGS' }),
      this.memory.recent({ limit: 1, kind: 'LORA_ADAPTER_ACTIVE' }),
    ]);
    return {
      inference: sanitizeInferenceSettings(evidenceObject(settingsRows[0])?.settings || {}),
      activeAdapter: adapterRows.length ? evidenceObject(adapterRows[0]) : null,
    };
  }

  async acquireExperience(input = {}) {
    return this.memory.acquireExperience(input);
  }

  async experienceContext(goal, options = {}) {
    return this.memory.experienceContext(goal, options);
  }

  async propose({ env, jobId, goal, inspectedFiles = [], previousAttempts = [], mode = 'implement' } = {}) {
    const objective = bounded(goal, 12_000).trim();
    if (!objective) throw Object.assign(new Error('MENTOR_GOAL_REQUIRED'), { code: 'MENTOR_GOAL_REQUIRED', status: 400 });
    const files = normalizeInspectedFiles(inspectedFiles);
    if (!files.length) throw Object.assign(new Error('MENTOR_INSPECTION_REQUIRED'), { code: 'MENTOR_INSPECTION_REQUIRED', status: 422 });
    const learned = await this._learnedRuntime();
    const [remembered, experiences] = await Promise.all([
      this.memory.context(objective, { limit: learned.inference.memory_results }),
      this.memory.experienceContext(objective, { limit: learned.inference.memory_results }),
    ]);
    const providers = await this._providers(env);
    if (!providers.length) throw Object.assign(new Error('MENTOR_NO_ZERO_COST_CODE_PROVIDER'), { code: 'MENTOR_NO_ZERO_COST_CODE_PROVIDER', status: 503 });

    const roles = ['implémenteur principal', 'relecteur architecture et régressions', 'testeur-réparateur'];
    const settled = await Promise.allSettled(providers.map((provider, index) => {
      const active = learned.activeAdapter;
      const lora = active?.base_model === provider.modelId ? active?.adapter?.id : null;
      return provider.invoke({
        input: buildPrompt({ role: roles[index % roles.length], goal: objective, files, lessons: remembered, experiences, previousAttempts, mode }),
        context: {
          purpose: 'mel-autonomous-development',
          job_id: jobId || null,
          mode,
          inference_settings: learned.inference,
          ...(lora ? { lora } : {}),
        },
      });
    }));

    const proposals = [];
    const failures = [];
    settled.forEach((result, index) => {
      const provider = providers[index];
      if (result.status === 'rejected') {
        failures.push({ provider: provider.id, error: bounded(result.reason?.code || result.reason?.message || 'PROVIDER_FAILED', 300) });
        return;
      }
      try {
        const proposal = normalizeProposal(result.value?.text ?? result.value, result.value?.provenance || { provider: provider.providerId, model: provider.modelId });
        proposals.push({ ...proposal, provider_id: provider.id, score: scoreProposal(proposal) });
      } catch (error) {
        failures.push({ provider: provider.id, error: bounded(error?.code || error?.message || 'INVALID_PROPOSAL', 300) });
      }
    });

    if (!proposals.length) {
      const error = new Error('MENTOR_NO_VALID_CODE_PROPOSAL');
      error.code = 'MENTOR_NO_VALID_CODE_PROPOSAL';
      error.status = 502;
      error.failures = failures;
      throw error;
    }

    proposals.sort((a, b) => b.score - a.score);
    const best = proposals[0];
    await this.memory.acquireExperience({
      fingerprint: [
        'mentor-council-proposal',
        jobId || 'no-job',
        mode,
        best.summary,
        best.changes.map(change => change.path).join(','),
      ].join('|'),
      job_id: jobId || null,
      goal: objective,
      source_type: mode === 'repair' ? 'MENTOR_COUNCIL_REPAIR_PROPOSAL' : 'MENTOR_COUNCIL_CODE_PROPOSAL',
      lesson: best.summary,
      evidence: {
        proposal_kind: mode === 'repair' ? 'REPAIR_PROPOSAL' : 'CODE_PROPOSAL',
        files: best.changes.map(x => x.path),
        tests: best.tests,
        provider: best.provenance,
        inference_settings: learned.inference,
        active_adapter_id: learned.activeAdapter?.adapter?.id || null,
      },
      score: best.confidence,
      tags: ['development', 'mentor', 'council', mode],
    });

    return {
      ok: true,
      job_id: jobId || null,
      mode,
      proposal: {
        summary: best.summary,
        changes: best.changes,
        tests: best.tests,
        confidence: best.confidence,
        lessons: best.lessons,
        risks: best.risks,
        provenance: best.provenance,
      },
      council: {
        providers_attempted: providers.map(p => p.id),
        valid_proposals: proposals.length,
        rejected_proposals: failures,
        selected_provider: best.provider_id,
      },
      learning: {
        memory_context_count: remembered.length,
        acquired_observation_count: experiences.observations.length,
        validated_experience_count: experiences.validated.length,
        inference_settings: learned.inference,
        active_adapter_id: learned.activeAdapter?.adapter?.id || null,
        active_adapter_base_model: learned.activeAdapter?.base_model || null,
      },
      memory_context_count: remembered.length,
      policy: 'ZERO_ADDED_COST_FAIL_CLOSED',
    };
  }

  async recordOutcome({ jobId, goal = '', outcome, lesson, evidence = null, score = 0, tags = [] } = {}) {
    const normalizedOutcome = String(outcome || 'UNKNOWN').toUpperCase();
    const text = bounded(lesson || `Développement ${normalizedOutcome.toLowerCase()} pour ${goal || jobId || 'MEL'}.`, 8000);
    return this.memory.remember({
      job_id: jobId || null,
      goal,
      kind: 'DEVELOPMENT_OUTCOME',
      lesson: text,
      evidence,
      outcome: normalizedOutcome,
      score,
      tags: ['development', 'outcome', ...tags],
    });
  }
}

export function createMentorEngine(env, options = {}) {
  return new MentorEngine({ memory: options.memory || new MentorMemoryRepository(env?.DB), providerFactory: options.providerFactory });
}

export const mentorPolicy = Object.freeze({
  max_files: MAX_FILES,
  max_source_chars: MAX_TOTAL_SOURCE_CHARS,
  max_changes: MAX_CHANGES,
  max_change_chars: MAX_CHANGE_CHARS,
  allowed_tests: [...ALLOWED_TESTS],
  deployment_requires_human_approval: true,
});
