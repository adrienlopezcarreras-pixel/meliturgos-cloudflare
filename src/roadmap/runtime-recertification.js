import { ROADMAP_TRUTH_WINDOW_MS } from './roadmap-truth.js';
import { getAutonomyControl } from '../evolution/autonomy-control.js';
import { proofRecipeRoadmapItem } from './proof-recipe-contracts.js';

// Reviewed core-only diagnostics. No tool inferred from risk alone, no arbitrary
// input, connector mutation, model call, physical action or adapter activation.
export const ROADMAP_RECERTIFICATION_PROFILES = Object.freeze({
  "GEN2-02": "identity.portability.verify",
  "GEN2-61": "roadmap.final-report.verify",
  "GEN2-51": "api.versioning.verify",
  "GEN2-52": "prompt.strategy.versioning.verify",
  "GEN2-11": "knowledge.graph.verify",
  "GEN2-10": "memory.contradiction.provenance.verify",
  "GEN2-50": "mcp.compatibility.verify",
  "MEL-SEC-01": "security.prompt-injection-firewall.verify",
  "MEL-EVAL-01": "evaluation.benchmark-contract.verify",
  "GEN2-43": "evaluation.model-watch.verify",
  "GEN2-03": "models.registry.verify",
  "GEN2-04": "models.router-fallback.verify",
  "MEL-CONTEXT-02": "context.long-decisions.verify",
  "MEL-CONTEXT-04": "context.interpreter.verify",
  "MEL-MEM-02": "memory.exchange-sync.verify",
  "MEL-COUNCIL-04": "models.task-learning.verify",
  "GEN2-32": "connectors.sdk-catalog.verify",
  "MEL-COUNCIL-03": "council.teacher-escalation.verify",
  "MEL-CONTEXT-01": "context.queue.verify",
  "MEL-CONN-01": "wordpress.public-boundary.verify",
  "MEL-CONN-02": "connectors.installable-catalog.verify",
  "MEL-VOICE-01": "voice.wake-phrase.verify",
  "MEL-AVATAR-01": "avatar.motion.verify",
  "MEL-AVATAR-02": "avatar.lipsync.verify",
  "MEL-AVATAR-03": "avatar.identity.verify",
  "GEN2-26": "pwa.manifest.verify",
  "MEL-SEC-05": "security.secret-harvest.verify",
  "GEN2-54": "ui.control-center.verify",
  "MEL-UI-01": "ui.home-minimal.verify",
  "MEL-UI-02": "ui.touch-avatar.verify",
  "MEL-UI-03": "ui.favicon.verify",
  "MEL-UI-06": "ui.file-paste.verify"
});
export const ROADMAP_RECERTIFICATION_REVISION = '2026-11-06-runtime-v1';

export function withRuntimeRecertification(roadmap, truth, { acceptedCodeIds = [] } = {}) {
  if (truth?.available !== true) return roadmap;
  const codeDelivered = new Set(acceptedCodeIds);
  const recipeWork = [];
  const items = roadmap.map(item => {
    if (String(item.status).toUpperCase() === 'REGRESSED') return item;
    if ((item.status !== 'DONE_VERIFIED' && !codeDelivered.has(item.id)) || truth.items?.[item.id]?.truth === 'VERIFIED_LIVE') return item;
    const capability = ROADMAP_RECERTIFICATION_PROFILES[item.id];
    if (!capability) {
      const recipe = proofRecipeRoadmapItem(item);
      if (recipe) recipeWork.push(recipe);
      return { ...item, status: 'WAITING_PROOF_RECIPE', recertification_only: true,
      proof_recipe_mission_id: recipe?.id || null,
      required_proof: 'RUNTIME_RECEIPT_REQUIRED',
      next: 'Recette de vérification à implémenter avant toute recertification. La mission auxiliaire ne certifie pas ce point; ne pas appeler un outil arbitraire ni déduire une preuve du statut historique.' };
    }
    return { ...item, status: 'RECERTIFICATION_REQUIRED', mode: 'VERIFY_RUNTIME', recertification_only: true,
      required_proof: 'AUDITED_EXACT_DEPLOYMENT_RUNTIME_RESULT',
      verification_capability: capability,
      next: 'Exécuter la recette logicielle existante '+capability+' et conserver son reçu audité récent. Aucune réécriture de fonctionnalité ni acceptation physique implicite.' };
  });
  return [...items, ...recipeWork];
}

export function isAcceptedRuntimeRecertificationJob(job, { now = Date.now() } = {}) {
  const proof = job?.result_json?.runtime_recertification;
  return job?.requested_by === 'mel-autonomy' && job.status === 'COMPLETED'
    && job.optional_context?.work_mode === 'VERIFY_RUNTIME'
    && proof?.schema === 'mel.roadmap-runtime-recertification/v1' && proof.status === 'VERIFIED'
    && proof.revision === ROADMAP_RECERTIFICATION_REVISION
    && proof.roadmap_id === job.optional_context.roadmap_id
    && proof.capability === ROADMAP_RECERTIFICATION_PROFILES[proof.roadmap_id]
    && typeof proof.capability === 'string'
    && /^[a-f0-9]{40}$/.test(String(proof.deployed_sha || ''))
    && /^[a-f0-9-]{36}$/.test(String(proof.execution_id || ''))
    && (typeof proof.audit_id === 'number' ? Number.isSafeInteger(proof.audit_id) && proof.audit_id > 0 : /^[A-Za-z0-9_-]{1,128}$/.test(String(proof.audit_id || '')))
    && Number.isSafeInteger(proof.at) && proof.at <= now && proof.at >= now-ROADMAP_TRUTH_WINDOW_MS
    && proof.external_acceptance_verified === false;
}

export async function executeRuntimeRecertification(env, repository, job, { createRuntime = null, now = Date.now() } = {}) {
  const id = job?.optional_context?.roadmap_id;
  const capability = ROADMAP_RECERTIFICATION_PROFILES[id];
  if (job?.requested_by !== 'mel-autonomy' || job.optional_context?.work_mode !== 'VERIFY_RUNTIME' || !capability)
    throw Object.assign(new Error('ROADMAP_RECERTIFICATION_RECIPE_REQUIRED'), { code: 'ROADMAP_RECERTIFICATION_RECIPE_REQUIRED' });
  if (job.status !== 'PLANNING') return { status: 'BLOCKED', job, code: 'ROADMAP_RECERTIFICATION_ADMISSION_REQUIRED' };
  const control = await getAutonomyControl(env?.DB);
  if (control.paused || control.max_autonomy !== true || control.repair || control.repair_invalid)
    return { status: 'BLOCKED', job, code: 'ROADMAP_RECERTIFICATION_OWNER_CONTROL' };
  const compiled = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '') : '';
  const sha = String(compiled || env?.MEL_DEPLOYED_GIT_SHA || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) return { status: 'BLOCKED', job, code: 'ROADMAP_RECERTIFICATION_DEPLOYMENT_REQUIRED' };
  try {
    const factory = createRuntime || (await import('../core/orchestrator/gen2-runtime.js')).createGen2Runtime;
    const { bus } = factory({ env });
    const record = bus.describe(capability);
    if (record.provider !== 'core' || record.category !== 'diagnostic' || record.risk !== 'LOW'
        || record.enabled !== true || record.permissions?.length !== 0)
      throw Object.assign(new Error('ROADMAP_RECERTIFICATION_UNSAFE_RECIPE'), { code: 'ROADMAP_RECERTIFICATION_UNSAFE_RECIPE' });
    const result = await bus.executeDetailed(capability, {}, { owner: 'mel-autonomy', permissions: [], requestId: job.id });
    if (result.output?.ok !== true) throw Object.assign(new Error('ROADMAP_RECERTIFICATION_RESULT_NOT_VERIFIED'), { code: 'ROADMAP_RECERTIFICATION_RESULT_NOT_VERIFIED' });
    // Audit logging is best-effort elsewhere: this acceptance must prove its
    // own exact execution persisted, not reuse any old success for this tool.
    const audit = await env.DB.prepare(`SELECT id FROM audit_logs WHERE action='capability_bus'
      AND json_valid(details_json) AND json_extract(details_json,'$.event_id')=?
      AND json_extract(details_json,'$.capability')=? AND json_extract(details_json,'$.status')='SUCCEEDED'
      AND created_at>=? ORDER BY created_at DESC LIMIT 1`).bind(result.execution_id, capability, now).first();
    if (!audit?.id) throw Object.assign(new Error('ROADMAP_RECERTIFICATION_AUDIT_REQUIRED'), { code: 'ROADMAP_RECERTIFICATION_AUDIT_REQUIRED' });
    const proof = { schema: 'mel.roadmap-runtime-recertification/v1', status: 'VERIFIED',
      revision: ROADMAP_RECERTIFICATION_REVISION, roadmap_id: id, capability,
      deployed_sha: sha, execution_id: result.execution_id, audit_id: audit.id, at: now,
      external_acceptance_verified: false };
    const updated = await repository.update(job.id, { status: 'COMPLETED', error: null,
      result_json: { ...(job.result_json || {}), runtime_recertification: proof } }, { expected: job });
    return { status: 'VERIFIED', job: updated, code: null };
  } catch (error) {
    if (error?.code === 'JOB_UPDATE_CONFLICT') throw error;
    const code = /^[A-Z0-9_]{1,100}$/.test(String(error?.code || '')) ? error.code : 'ROADMAP_RECERTIFICATION_FAILED';
    const updated = await repository.update(job.id, { status: 'FAILED', error: code,
      result_json: { ...(job.result_json || {}), runtime_recertification: {
        status: 'FAILED', roadmap_id: id, capability, at: now, deployed_sha: sha, code,
      } } }, { expected: job });
    return { status: 'FAILED', job: updated, code };
  }
}
