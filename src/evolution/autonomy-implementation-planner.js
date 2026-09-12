import { createGitHubCodeReader } from '../capabilities/github-code-capabilities.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';

const MAX_FILES = 5;
const MAX_EXCERPT = 3500;
const MAX_PLAN_TEXT = 12000;
const SHA40 = /^[0-9a-f]{40}$/i;
const QUALITY_SECTIONS = Object.freeze([
  ['FICHIERS', /FICHIERS\s*:/i],
  ['CHANGEMENTS', /CHANGEMENTS\s*:/i],
  ['REUTILISATION', /(?:RÉUTILISATION|REUTILISATION|REUSE)\s*:/i],
  ['TESTS', /TESTS\s*:/i],
  ['RISQUES', /RISQUES\s*:/i],
  ['ROLLBACK', /ROLLBACK\s*:/i],
  ['CRITERES_DE_FIN', /(?:CRITÈRES_DE_FIN|CRITERES_DE_FIN)\s*:/i],
]);

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

function approvedCandidateSha(bridge) {
  const sha = String(bridge?.request?.candidate?.sha || bridge?.evidence?.candidate_sha || '').trim();
  if (!SHA40.test(sha)) {
    throw Object.assign(new Error('TEACHER_APPROVAL_CANDIDATE_SHA_REQUIRED'), { code: 'TEACHER_APPROVAL_CANDIDATE_SHA_REQUIRED' });
  }
  return sha.toLowerCase();
}

function approvedCandidateBranch(bridge) {
  const branch = String(bridge?.request?.candidate?.branch || '').trim();
  if (!branch.startsWith('candidate/')) {
    throw Object.assign(new Error('TEACHER_APPROVAL_CANDIDATE_BRANCH_REQUIRED'), { code: 'TEACHER_APPROVAL_CANDIDATE_BRANCH_REQUIRED' });
  }
  return branch;
}

function codeConfig(env = {}) {
  const repository = String(env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  const canonicalBranch = String(env.MEL_GITHUB_BRANCH || 'candidate/mel-clean-autonomy').trim();
  const teacherBranch = String(env.MEL_TEACHER_BRANCH || canonicalBranch).trim();
  if (!canonicalBranch.startsWith('candidate/') || !teacherBranch.startsWith('candidate/')) {
    throw Object.assign(new Error('AUTONOMY_BRANCH_NOT_CANDIDATE'), { code: 'AUTONOMY_BRANCH_NOT_CANDIDATE' });
  }
  if (canonicalBranch !== teacherBranch) {
    const error = new Error('AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE');
    error.code = 'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE';
    error.canonical_branch = canonicalBranch;
    error.teacher_branch = teacherBranch;
    throw error;
  }
  return { repository, branch: canonicalBranch };
}

function assertTeacherApprovedBranch(config, bridge) {
  const approvedBranch = approvedCandidateBranch(bridge);
  if (approvedBranch !== config.branch) {
    const error = new Error('TEACHER_APPROVAL_CANDIDATE_BRANCH_MISMATCH');
    error.code = 'TEACHER_APPROVAL_CANDIDATE_BRANCH_MISMATCH';
    error.approved_candidate_branch = approvedBranch;
    error.current_candidate_branch = config.branch;
    throw error;
  }
  return approvedBranch;
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

function assertTeacherApprovedHead(head, bridge) {
  const headSha = String(head?.sha || '').trim();
  if (!SHA40.test(headSha)) {
    throw Object.assign(new Error('CANDIDATE_HEAD_INVALID'), { code: 'CANDIDATE_HEAD_INVALID' });
  }
  const approvedSha = approvedCandidateSha(bridge);
  if (headSha.toLowerCase() !== approvedSha) {
    const error = new Error('TEACHER_APPROVAL_CANDIDATE_SHA_STALE');
    error.code = 'TEACHER_APPROVAL_CANDIDATE_SHA_STALE';
    error.approved_candidate_sha = approvedSha;
    error.current_candidate_sha = headSha.toLowerCase();
    throw error;
  }
  return approvedSha;
}

function assertPlanQualityContract(value) {
  const text = String(value || '');
  const missing = QUALITY_SECTIONS.filter(([, pattern]) => !pattern.test(text)).map(([name]) => name);
  if (missing.length) {
    const error = new Error('IMPLEMENTATION_QUALITY_CONTRACT_MISSING');
    error.code = 'IMPLEMENTATION_QUALITY_CONTRACT_MISSING';
    error.missing_sections = missing;
    throw error;
  }
  return text;
}

async function collectCodeContext(env, job, bridge, { fetchImpl = fetch } = {}) {
  const { config, reader } = codeReader(env, fetchImpl);
  assertTeacherApprovedBranch(config, bridge);
  const headBefore = await reader.head();
  assertTeacherApprovedHead(headBefore, bridge);
  const roadmapId = String(job?.optional_context?.roadmap_id || '').trim();
  if (!roadmapId) {
    throw Object.assign(new Error('IMPLEMENTATION_ROADMAP_ID_REQUIRED'), { code: 'IMPLEMENTATION_ROADMAP_ID_REQUIRED' });
  }

  const fromInspection = Array.isArray(bridge?.evidence?.inspection_files) ? bridge.evidence.inspection_files : [];
  const fromSearch = [];
  let reuseSearch;
  try {
    const search = await reader.search({ query: roadmapId });
    reuseSearch = {
      query: roadmapId,
      searched_files: Number(search?.searched_files || 0),
      matches: (Array.isArray(search?.matches) ? search.matches : []).slice(0, 20).map((match) => ({
        path: String(match?.path || '').slice(0, 1000),
        line: Number(match?.line || 0),
      })).filter((match) => match.path),
    };
    for (const match of search.matches || []) fromSearch.push(match.path);
  } catch (error) {
    const wrapped = new Error('IMPLEMENTATION_REUSE_SEARCH_FAILED');
    wrapped.code = 'IMPLEMENTATION_REUSE_SEARCH_FAILED';
    wrapped.cause_code = String(error?.code || error?.message || 'UNKNOWN').slice(0, 120);
    throw wrapped;
  }
  if (!reuseSearch || reuseSearch.searched_files < 1) {
    throw Object.assign(new Error('IMPLEMENTATION_REUSE_SEARCH_REQUIRED'), { code: 'IMPLEMENTATION_REUSE_SEARCH_REQUIRED' });
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
  assertTeacherApprovedHead(headAfter, bridge);
  return { ...config, candidate_sha: headAfter.sha, files, reuse_search: reuseSearch };
}

async function reusableProposal(env, existing, bridge, { fetchImpl = fetch } = {}) {
  if (existing?.status !== 'READY') return null;
  if (!existing?.teacher_request_id || existing.teacher_request_id !== bridge.request.request_id) return null;
  if (!SHA40.test(String(existing?.candidate_sha || ''))) return null;
  if (existing?.consolidation?.policy !== 'SINGLE_CANONICAL_CANDIDATE') return null;
  const approvedSha = approvedCandidateSha(bridge);
  const { config, reader } = codeReader(env, fetchImpl);
  assertTeacherApprovedBranch(config, bridge);
  if (String(existing.candidate_branch || '') !== config.branch) return null;
  if (String(existing?.consolidation?.canonical_branch || '') !== config.branch) return null;
  if (!Array.isArray(existing.providers_attempted) || existing.providers_attempted.length < 2) return null;

  const head = await reader.head();
  assertTeacherApprovedHead(head, bridge);
  if (String(existing.candidate_sha).toLowerCase() !== approvedSha) return null;
  return { ...existing, reused: true };
}

function planningPrompt(job, bridge, code) {
  const reusePaths = (code?.reuse_search?.matches || []).map((match) => match.path).filter(Boolean).slice(0, 12);
  return [
    'Tu es un ingénieur participant au développement supervisé de MELITURGOS.',
    'Le plan a déjà reçu une approbation Teacher. Tu ne déploies rien et tu ne modifies aucun compte.',
    'Conçois le plus petit changement réversible sur la SEULE branche candidate canonique indiquée ci-dessous.',
    'Interdiction de créer ou proposer une deuxième branche candidate, une deuxième roadmap, un second orchestrateur ou un module parallèle qui duplique une capacité existante.',
    'Réutilise l’existant avant toute création. Si un nouveau fichier est réellement nécessaire, justifie explicitement pourquoi aucun composant existant ne peut porter le changement.',
    'Aucun secret, aucun DNS, aucune facturation, aucune migration D1 destructive.',
    'Réponds obligatoirement avec les sections: FICHIERS, CHANGEMENTS, REUTILISATION, TESTS, RISQUES, ROLLBACK, CRITERES_DE_FIN.',
    `OBJECTIF: ${String(job.goal || '').slice(0, 4000)}`,
    `ROADMAP_ID: ${String(job?.optional_context?.roadmap_id || '')}`,
    `TEACHER_FEEDBACK: ${String(bridge?.review?.feedback || '').slice(0, 4000)}`,
    `BRANCHE_CANDIDATE_CANONIQUE: ${code.branch}`,
    `SHA_CANDIDAT_INSPECTÉ: ${code.candidate_sha}`,
    `REUSE_SEARCH_QUERY: ${String(code?.reuse_search?.query || '')}`,
    `REUSE_CANDIDATES: ${reusePaths.length ? reusePaths.join(', ') : 'aucun match direct; justifier toute création'}`,
    'CONTEXTE_CODE:',
    ...code.files.map((file) => `--- ${file.path} @ ${file.sha || 'unknown'} ---\n${file.excerpt}`),
  ].join('\n');
}

/**
 * After a correlated Teacher approval, MEL itself performs a bounded multi-AI
 * CODE planning pass over the exact candidate SHA reviewed by the Teacher and
 * persists the best proposal. A branch advance or branch divergence invalidates
 * the approval and fails closed; the autonomy runtime must obtain a fresh
 * Teacher review before implementation planning can resume.
 */
export async function prepareApprovedImplementationProposal({ env, repository, job, fetchImpl = fetch } = {}) {
  if (!repository || !job) throw Object.assign(new Error('AUTONOMY_IMPLEMENTATION_INPUT_REQUIRED'), { code: 'AUTONOMY_IMPLEMENTATION_INPUT_REQUIRED' });
  const current = await repository.get(job.id);
  if (!current) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });

  // Revalidate Teacher authority and the exact approved candidate SHA/branch
  // before considering persisted work reusable. A READY payload is only an
  // optimization, never an authorization shortcut.
  const bridge = requireApproved(current);
  approvedCandidateSha(bridge);
  approvedCandidateBranch(bridge);
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
      consolidation_policy: 'SINGLE_CANONICAL_CANDIDATE',
    },
    maxCandidates: 2,
  });
  if (!Array.isArray(fanout.providersAttempted) || fanout.providersAttempted.length < 2) {
    throw Object.assign(new Error('IMPLEMENTATION_MULTI_AI_NOT_PROVEN'), { code: 'IMPLEMENTATION_MULTI_AI_NOT_PROVEN' });
  }
  if (!fanout.best?.text) throw Object.assign(new Error('IMPLEMENTATION_PROPOSAL_EMPTY'), { code: 'IMPLEMENTATION_PROPOSAL_EMPTY' });
  const selectedText = assertPlanQualityContract(fanout.best.text);

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
    providers_attempted: fanout.providersAttempted.slice(0, 8),
    consolidation: {
      policy: 'SINGLE_CANONICAL_CANDIDATE',
      canonical_branch: code.branch,
      alternate_candidate_allowed: false,
      duplicate_module_allowed: false,
      reuse_search: {
        query: code.reuse_search.query,
        searched_files: code.reuse_search.searched_files,
        match_paths: [...new Set(code.reuse_search.matches.map((match) => match.path))].slice(0, 20),
      },
    },
    selected: {
      provider: fanout.best.provider,
      model: fanout.best.model,
      text: String(selectedText).slice(0, MAX_PLAN_TEXT),
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
