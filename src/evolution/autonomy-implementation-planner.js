import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { canonicalizeImplementationFanout, UNIFIED_DEVELOPMENT_POLICY } from './unified-development-policy.js';

const MAX_FILES = 5;
const MAX_EXCERPT = 3500;
const MAX_PLAN_TEXT = 12000;
const SHA40 = /^[0-9a-f]{40}$/i;

function requireApproved(job) {
  const bridge = job?.result_json?.teacher_bridge;
  const review = bridge?.review;
  if (String(job?.status || '').toUpperCase() !== 'TEACHER_APPROVED' || bridge?.status !== 'ANSWERED' || review?.development_allowed !== true || review?.verdict !== 'APPROVE_PLAN') {
    throw Object.assign(new Error('TEACHER_APPROVAL_REQUIRED'), { code: 'TEACHER_APPROVAL_REQUIRED' });
  }
  if (!bridge?.request?.request_id || review.request_id !== bridge.request.request_id) {
    throw Object.assign(new Error('TEACHER_APPROVAL_CORRELATION_INVALID'), { code: 'TEACHER_APPROVAL_CORRELATION_INVALID' });
  }
  return bridge;
}

function codeConfig(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const branch = String(env.MEL_TEACHER_BRANCH || 'candidate/augmentio-core');
  if (!branch.startsWith('candidate/')) {
    throw Object.assign(new Error('AUTONOMY_BRANCH_NOT_CANDIDATE'), { code: 'AUTONOMY_BRANCH_NOT_CANDIDATE' });
  }
  return { repository, branch };
}

function codeReader(env, fetchImpl) {
  const config = codeConfig(env);
  return {
    config,
    reader: createGitHubCodeReader({
      repository: config.repository,
      branch: config.branch,
      token: String(env?.MEL_GITHUB_TOKEN || ''),
      fetchImpl,
    }),
  };
}

function uniquePaths(values) {
  const out = [];
  for (const value of values) {
    const path = String(value || '').trim();
    if (!path || out.includes(path)) continue;
    out.push(path);
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

async function collectCodeContext(env, job, bridge, { fetchImpl = fetch } = {}) {
  const { config, reader } = codeReader(env, fetchImpl);
  const headBefore = await reader.head();
  const roadmapId = String(job?.optional_context?.roadmap_id || '').trim();
  const fromInspection = Array.isArray(bridge?.evidence?.inspection_files) ? bridge.evidence.inspection_files : [];
  const fromSearch = [];
  if (roadmapId) {
    try {
      const search = await reader.search({ query: roadmapId });
      for (const match of search.matches || []) fromSearch.push(match.path);
    } catch {}
  }
  const fallbacks = [
    'src/evolution/autonomy-runtime.js',
    'src/evolution/autonomy-supervisor.js',
    'src/work/work-dag.js',
    'src/teachers/runtime-teacher-bridge.js',
    'src/roadmap/master-roadmap.js',
  ];
  const paths = uniquePaths([...fromSearch, ...fromInspection, ...fallbacks]);
  const files = [];
  for (const path of paths) {
    try {
      const source = await reader.read(path);
      files.push({
        path: source.path,
        sha: source.sha || '',
        excerpt: String(source.content || '').slice(0, MAX_EXCERPT),
      });
    } catch {}
  }
  if (!files.length) throw Object.assign(new Error('APPROVED_IMPLEMENTATION_CODE_CONTEXT_REQUIRED'), { code: 'APPROVED_IMPLEMENTATION_CODE_CONTEXT_REQUIRED' });
  const headAfter = await reader.head();
  if (headBefore.sha !== headAfter.sha) {
    throw Object.assign(new Error('CANDIDATE_HEAD_CHANGED_DURING_INSPECTION'), { code: 'CANDIDATE_HEAD_CHANGED_DURING_INSPECTION' });
  }
  return { ...config, candidate_sha: headAfter.sha, files };
}

async function reusableProposal(env, existing, bridge, { fetchImpl = fetch } = {}) {
  if (existing?.status !== 'READY') return null;
  if (!existing?.teacher_request_id || existing.teacher_request_id !== bridge.request.request_id) return null;
  if (!SHA40.test(String(existing?.candidate_sha || ''))) return null;
  const { config, reader } = codeReader(env, fetchImpl);
  if (String(existing.candidate_branch || '') !== config.branch) return null;
  if (!Array.isArray(existing.providers_attempted) || existing.providers_attempted.length < 2) return null;
  if (existing.persistence !== 'ONE_SELECTED_PLAN_ONLY') return null;

  const head = await reader.head();
  if (!SHA40.test(String(head?.sha || ''))) {
    throw Object.assign(new Error('CANDIDATE_HEAD_INVALID'), { code: 'CANDIDATE_HEAD_INVALID' });
  }
  if (String(existing.candidate_sha).toLowerCase() !== String(head.sha).toLowerCase()) return null;
  return { ...existing, reused: true };
}

function planningPrompt(job, bridge, code) {
  return [
    'Tu es un ingénieur participant au développement supervisé de MELITURGOS.',
    'Le plan a déjà reçu une approbation Teacher. Tu ne déploies rien et tu ne modifies aucun compte.',
    'Conçois le plus petit changement réversible sur la branche candidate canonique uniquement.',
    'Réutilise et modifie l’existant; n’invente pas une capacité, un module ou une architecture parallèle déjà couverte.',
    'Tu es une voix consultative parmi plusieurs. Ta proposition ne doit créer aucune branche ou version alternative permanente.',
    'Après comparaison des avis, MEL ne conservera qu’un seul plan canonique.',
    'Aucun secret, aucun DNS, aucune facturation, aucune migration D1 destructive.',
    'Réponds en texte structuré avec: FICHIERS_EXISTANTS_À_MODIFIER, CHANGEMENTS, TESTS, RISQUES, ROLLBACK, CRITÈRES_DE_FIN.',
    `OBJECTIF: ${String(job.goal || '').slice(0, 4000)}`,
    `ROADMAP_ID: ${String(job?.optional_context?.roadmap_id || '')}`,
    `TEACHER_FEEDBACK: ${String(bridge?.review?.feedback || '').slice(0, 4000)}`,
    `BRANCHE_CANDIDATE_CANONIQUE: ${code.branch}`,
    `SHA_CANDIDAT_INSPECTÉ: ${code.candidate_sha}`,
    'CONTEXTE_CODE:',
    ...code.files.map((file) => `--- ${file.path} @ ${file.sha || 'unknown'} ---\n${file.excerpt}`),
  ].join('\n');
}

/**
 * After a correlated Teacher approval, MEL performs a bounded multi-AI CODE
 * planning pass over the same candidate source. Provider responses are
 * advisory only. Exactly ONE selected plan is persisted; alternative provider
 * plans are discarded after comparison and can never become parallel branches,
 * modules or jobs. The external Teacher/dev channel may apply only that single
 * canonical candidate change and provide exact CI proof.
 */
export async function prepareApprovedImplementationProposal({ env, repository, job, fetchImpl = fetch } = {}) {
  if (!repository || !job) throw Object.assign(new Error('AUTONOMY_IMPLEMENTATION_INPUT_REQUIRED'), { code: 'AUTONOMY_IMPLEMENTATION_INPUT_REQUIRED' });
  const current = await repository.get(job.id);
  if (!current) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });

  const bridge = requireApproved(current);
  const existing = current?.result_json?.implementation_proposal;
  const reusable = await reusableProposal(env, existing, bridge, { fetchImpl });
  if (reusable) return reusable;

  const code = await collectCodeContext(env, current, bridge, { fetchImpl });
  const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(env) });
  const fanout = await augmentio.fanOut({
    capability: 'CODE',
    input: planningPrompt(current, bridge, code),
    context: {
      purpose: 'MEL_APPROVED_IMPLEMENTATION_PLAN',
      job_id: current.id,
      request_id: bridge.request.request_id,
      roadmap_id: current.optional_context?.roadmap_id || null,
      candidate_branch: code.branch,
      candidate_sha: code.candidate_sha,
      persistence: 'advisory-until-single-selection',
      provider_direct_write_allowed: false,
      parallel_implementations_allowed: false,
    },
    maxCandidates: 2,
  });
  if (!Array.isArray(fanout.providersAttempted) || fanout.providersAttempted.length < 2) {
    throw Object.assign(new Error('IMPLEMENTATION_MULTI_AI_NOT_PROVEN'), { code: 'IMPLEMENTATION_MULTI_AI_NOT_PROVEN' });
  }

  const canonical = canonicalizeImplementationFanout(fanout);
  const proposal = {
    status: 'READY',
    schema: 'mel.approved-implementation-proposal',
    version: 2,
    created_at: new Date().toISOString(),
    teacher_request_id: bridge.request.request_id,
    candidate_branch: code.branch,
    candidate_sha: code.candidate_sha,
    roadmap_id: current.optional_context?.roadmap_id || null,
    inspected_files: code.files.map((file) => ({ path: file.path, sha: file.sha || '' })),
    providers_attempted: canonical.providers_attempted,
    selected: {
      ...canonical.selected,
      text: canonical.selected.text.slice(0, MAX_PLAN_TEXT),
    },
    discarded_alternative_count: canonical.discarded_alternative_count,
    persistence: canonical.persistence,
    unified_update_policy: UNIFIED_DEVELOPMENT_POLICY.mode,
    provider_direct_writes_allowed: false,
    parallel_implementations_allowed: false,
    production_touched: false,
    candidate_write_performed: false,
    next: 'EXTERNAL_TEACHER_APPLY_ONE_CANONICAL_CANDIDATE_DIFF_AND_VERIFY_FULL_CI',
  };

  const result = current.result_json && typeof current.result_json === 'object' ? { ...current.result_json } : {};
  result.implementation_proposal = proposal;
  const updated = await repository.update(current.id, { result_json: result });
  return updated.result_json.implementation_proposal;
}
