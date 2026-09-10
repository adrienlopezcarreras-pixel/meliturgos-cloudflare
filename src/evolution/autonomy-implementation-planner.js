import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';

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
  const config = codeConfig(env);
  const reader = createGitHubCodeReader({
    repository: config.repository,
    branch: config.branch,
    fetchImpl,
  });
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

function planningPrompt(job, bridge, code) {
  return [
    'Tu es un ingénieur participant au développement supervisé de MELITURGOS.',
    'Le plan a déjà reçu une approbation Teacher. Tu ne déploies rien et tu ne modifies aucun compte.',
    'Conçois le plus petit changement réversible sur candidate uniquement.',
    'Réutilise l’existant; n’invente pas une capacité déjà présente.',
    'Aucun secret, aucun DNS, aucune facturation, aucune migration D1 destructive.',
    'Réponds en texte structuré avec: FICHIERS, CHANGEMENTS, TESTS, RISQUES, ROLLBACK, CRITÈRES_DE_FIN.',
    `OBJECTIF: ${String(job.goal || '').slice(0, 4000)}`,
    `ROADMAP_ID: ${String(job?.optional_context?.roadmap_id || '')}`,
    `TEACHER_FEEDBACK: ${String(bridge?.review?.feedback || '').slice(0, 4000)}`,
    `BRANCHE_CANDIDATE: ${code.branch}`,
    `SHA_CANDIDAT_INSPECTÉ: ${code.candidate_sha}`,
    'CONTEXTE_CODE:',
    ...code.files.map((file) => `--- ${file.path} @ ${file.sha || 'unknown'} ---\n${file.excerpt}`),
  ].join('\n');
}

/**
 * After a correlated Teacher approval, MEL itself performs a bounded multi-AI
 * CODE planning pass over the candidate source and persists the best proposal.
 * It deliberately does not write GitHub or deploy; the external Teacher/dev
 * channel can apply the reviewed candidate change and provide exact CI proof.
 * The lifecycle status stays TEACHER_APPROVED because this internal proposal is
 * evidence/work product, not a second authorization state.
 */
export async function prepareApprovedImplementationProposal({ env, repository, job, fetchImpl = fetch } = {}) {
  if (!repository || !job) throw Object.assign(new Error('AUTONOMY_IMPLEMENTATION_INPUT_REQUIRED'), { code: 'AUTONOMY_IMPLEMENTATION_INPUT_REQUIRED' });
  const current = await repository.get(job.id);
  if (!current) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
  const existing = current?.result_json?.implementation_proposal;
  if (existing?.status === 'READY' && existing?.teacher_request_id && SHA40.test(String(existing?.candidate_sha || ''))) {
    return { ...existing, reused: true };
  }

  const bridge = requireApproved(current);
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
    },
    maxCandidates: 2,
  });
  if (!Array.isArray(fanout.providersAttempted) || fanout.providersAttempted.length < 2) {
    throw Object.assign(new Error('IMPLEMENTATION_MULTI_AI_NOT_PROVEN'), { code: 'IMPLEMENTATION_MULTI_AI_NOT_PROVEN' });
  }
  if (!fanout.best?.text) throw Object.assign(new Error('IMPLEMENTATION_PROPOSAL_EMPTY'), { code: 'IMPLEMENTATION_PROPOSAL_EMPTY' });

  const proposal = {
    status: 'READY',
    schema: 'mel.approved-implementation-proposal',
    version: 1,
    created_at: new Date().toISOString(),
    teacher_request_id: bridge.request.request_id,
    candidate_branch: code.branch,
    candidate_sha: code.candidate_sha,
    roadmap_id: current.optional_context?.roadmap_id || null,
    inspected_files: code.files.map((file) => ({ path: file.path, sha: file.sha || '' })),
    providers_attempted: fanout.providersAttempted.slice(0, 8),
    selected: {
      provider: fanout.best.provider,
      model: fanout.best.model,
      text: String(fanout.best.text).slice(0, MAX_PLAN_TEXT),
    },
    alternatives: fanout.candidates.slice(1, 3).map((candidate) => ({
      provider: candidate.provider,
      model: candidate.model,
      text: String(candidate.text || '').slice(0, 4000),
    })),
    production_touched: false,
    candidate_write_performed: false,
    next: 'EXTERNAL_TEACHER_APPLY_SMALLEST_CANDIDATE_DIFF_AND_VERIFY_FULL_CI',
  };

  const result = current.result_json && typeof current.result_json === 'object' ? { ...current.result_json } : {};
  result.implementation_proposal = proposal;
  const updated = await repository.update(current.id, { result_json: result });
  return updated.result_json.implementation_proposal;
}
