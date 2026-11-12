// Bounded software proofs for open roadmap rows. Each one re-runs the
// decision the contract already specifies. None calls a model, writes
// production data, or claims a device or a real LoRA run.
import { inferChatMediaCapability } from '../api/chat-media-intent.js';
import { collectChatMedia } from '../api/chat-media.js';
import { buildResponseQualityInstruction, extractSubRequests } from '../api/response-quality.js';
import { verifyIsolatedRestore } from '../backup/restore-service.js';
import { councilOperationalCatalog, councilRecommendationRequest } from '../council/operational-catalog.js';
import { actionsRelayDecision, applyLifeCountermeasure, respondToLifeEvent } from '../continuity/life-contingency.js';
import { architectureFindings, storeArchitectureReport } from '../diagnostics/architecture-audit-store.js';
import { auditDevelopment } from '../diagnostics/development-audit.js';
import { auditChat, auditCore, auditWatch, auditWork } from '../diagnostics/domain-audit.js';
import { measureOutcomeRepairs, recordRepairs } from '../diagnostics/outcome-loop.js';
import { beginAutonomyCheckpoint, pendingAutonomyCheckpoint, tryAcquireAutonomyRuntimeLease } from '../evolution/autonomy-runtime-lease.js';
import { imageAnalysisCoverage } from '../media/image-vision-runtime.js';
import { manifest01FoundationPrerequisites } from './manifest-01-acceptance.js';

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function proveChatMediaIntent() {
  const photo = inferChatMediaCapability('Bonjour, montre-moi une photo de la tour Eiffel');
  const three = inferChatMediaCapability('montre-moi trois photos de chats');
  if (photo?.id !== 'web.images.search' || photo.input?.query !== 'la tour Eiffel' || photo.input?.max_images !== 1) fail('CHAT_MEDIA_INTENT_PROOF_FAILED');
  if (three?.input?.max_images !== 3) fail('CHAT_MEDIA_COUNT_PROOF_FAILED');
  for (const text of ['ne me montre pas de photo de chat', 'explique la différence entre une photo et une vidéo', 'donne un exemple JSON: {"photo":true}']) {
    if (inferChatMediaCapability(text) !== null) fail('CHAT_MEDIA_NEGATION_PROOF_FAILED');
  }
  return { ok: true };
}

function proveResponseQuality() {
  const parts = extractSubRequests('corrige le titre, puis déploie, et dis-moi le statut');
  const instruction = buildResponseQualityInstruction('explique la différence, puis donne la source');
  if (parts.length < 2) fail('RESPONSE_QUALITY_SUBREQUEST_PROOF_FAILED');
  if (!instruction.includes('FAITS') || !instruction.includes('HYPOTHÈSES') || !instruction.includes('REFUS') || !instruction.includes('SOURCES CONSULTÉES')) {
    fail('RESPONSE_QUALITY_RECIPE_PROOF_FAILED');
  }
  return { ok: true };
}

async function proveLifeContingency() {
  const paused = await applyLifeCountermeasure('MAX_PAUSED_BY_SAFETY', { keepMax: async () => ({ ok: true }) });
  const relay = actionsRelayDecision({ workerUp: false, companionOnline: false });
  const standby = actionsRelayDecision({ workerUp: true, companionOnline: true });
  const known = respondToLifeEvent('UPDATE_CI_FAILED');
  if (paused.countermeasure !== 'KEEP_PAUSE' || paused.activation_performed !== false) fail('LIFE_PAUSE_PROOF_FAILED');
  if (relay.run !== true || relay.activation_performed !== false || relay.status === 'ALREADY_EXECUTED') fail('LIFE_RELAY_PROOF_FAILED');
  if (standby.run !== false || standby.status !== 'STANDBY_NOT_NEEDED') fail('LIFE_STANDBY_PROOF_FAILED');
  if (!known.countermeasure) fail('LIFE_COUNTERMEASURE_PROOF_FAILED');
  return { ok: true };
}

function proveOutcomeLoop() {
  const now = Date.parse('2026-11-12T00:00:00Z');
  const first = recordRepairs({}, [{ code: 'LEAK', detail: 'encore là' }], { now, jobId: 'job-1' });
  const second = recordRepairs(first, [{ code: 'LEAK', detail: 'encore là' }], { now: now + 1000, jobId: 'job-2' });
  if (second.LEAK?.job_id !== 'job-1' || second.LEAK?.attempts !== 1) fail('OUTCOME_SINGLE_JOB_PROOF_FAILED');
  const gone = measureOutcomeRepairs(first, [], { measured: true, now: now + 1000 });
  const still = measureOutcomeRepairs(first, [{ code: 'LEAK', detail: 'encore là' }], { measured: true, now: now + 8 * 86_400_000 });
  if (gone.resolved.length !== 1 || still.resolved.length !== 0 || still.persisting.length !== 1) fail('OUTCOME_MEASURE_PROOF_FAILED');
  return { ok: true };
}

function proveManifestFoundation() {
  const report = manifest01FoundationPrerequisites(undefined, {
    businessIndicators: [1, 2, 3, 4, 5, 6].map(value => ({ id: 'i' + value, value })),
  });
  const device = report.priorities.find(row => row.priority === 4);
  if (report.business_indicators.length !== 5 || report.business_indicators.some(row => row.kind !== 'REPORT_DATA')) fail('MANIFEST_INDICATOR_PROOF_FAILED');
  if (!device || device.roadmap_id !== 'MEL-FOUNDER-06' || device.blocking !== false || device.verified !== false) fail('MANIFEST_DEVICE_PROOF_FAILED');
  return { ok: true };
}

function proveDevelopmentAudit() {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const job = over => ({ id: over.id, updated_at: now - 3_600_000, status: 'QUEUED', optional_context: {}, ...over });
  const report = auditDevelopment({
    now, maxAutonomy: true,
    jobs: [
      job({ id: 'done', status: 'COMPLETED' }),
      job({ id: 'blocked', status: 'BLOCKED' }),
      job({ id: 'done', status: 'FAILED' }),
      ...['a', 'b', 'c', 'd'].map(suffix => job({ id: 'loop-' + suffix, optional_context: { roadmap_id: 'MEL-LOOP' } })),
    ],
  });
  const loops = report.findings.filter(row => row.code === 'MISSION_LOOP');
  if (report.summary.completed !== 1 || report.summary.blocked !== 1 || report.summary.repeated_objectives !== 1 || loops.length !== 1) {
    fail('DEVELOPMENT_AUDIT_PROOF_FAILED');
  }
  return { ok: true };
}

function proveDomainFindings() {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const chat = auditChat([1, 2, 3].map(id => ({
    id: 'chat-' + id, created_at: now,
    issues_json: id < 3 ? '[{"severity":"high"}]' : '[]',
    user_excerpt: 'question ' + id, response_excerpt: 'réponse',
  })), { now });
  const watch = auditWatch([{
    id: 'daily-watch', updated_at: now - 3 * 86_400_000,
    state_json: JSON.stringify({ last_run_at: now - 3 * 86_400_000, interval_ms: 86_400_000 }),
  }], { now });
  const work = auditWork([{ id: 'cycle-1', updated_at: now, state: 'INTERRUPTED' }], { now });
  const codes = new Set([...chat, ...watch, ...work].map(row => row.code));
  if (!codes.has('CHAT_OFF_TOPIC_ANSWERS') || !codes.has('WATCH_STALLED') || !codes.has('WORK_NO_COMPLETED_CYCLE')) {
    fail('DOMAIN_AUDIT_PROOF_FAILED');
  }
  return { ok: true };
}

function memoryDb() {
  const rows = new Map();
  const statement = (sql, args = []) => ({
    bind(...next) { return statement(sql, next); },
    async first() {
      if (String(sql).includes('source_sha')) {
        const row = rows.get('latest');
        return row ? { source_sha: row.sha } : null;
      }
      return null;
    },
    async run() {
      if (args.length >= 3) rows.set('latest', { sha: args[2], at: args[3], body: args[1] });
    },
  });
  return { prepare(sql) { return statement(sql); } };
}

async function proveArchitectureReport() {
  const db = memoryDb();
  const report = { schema: 'mel.architecture-audit/v1', source_files: 1, max_lines: 1500 };
  const sha = 'a'.repeat(40);
  await storeArchitectureReport(db, report, { sha, now: 1_000 });
  const replay = await storeArchitectureReport(db, report, { sha, now: 9_000 });
  if (replay.status !== 'ARCHITECTURE_REPORT_ALREADY_STORED') fail('ARCHITECTURE_REPLAY_PROOF_FAILED');
  let refused = false;
  try { await storeArchitectureReport(db, report, { sha: 'not-a-sha', now: 2_000 }); }
  catch (error) { refused = error?.message === 'ARCHITECTURE_REPORT_IDENTITY_INVALID'; }
  if (!refused) fail('ARCHITECTURE_IDENTITY_PROOF_FAILED');
  return { ok: true };
}

function proveCoreClock() {
  const now = Date.parse('2026-11-12T00:00:00Z');
  const old = auditCore({
    memory: { candidates: Array.from({ length: 101 }, (_, index) => ({ status: 'PENDING', created_at: now - 8 * 86_400_000, id: 'm' + index })) },
    sessions: { rows: [{ expires_at: now - 1_000 }] },
    lastBackupAt: now - 4 * 86_400_000,
  }, { now });
  const healthy = auditCore({
    memory: { candidates: [{ status: 'PENDING', created_at: now - 1_000 }] },
    sessions: { rows: [{ expires_at: now + 86_400_000 }] },
    lastBackupAt: now,
  }, { now });
  const codes = new Set(old.map(row => row.code));
  if (!codes.has('MEMORY_UNCONSOLIDATED') || !codes.has('SECURITY_EXPIRED_SESSIONS_KEPT') || !codes.has('BACKUP_STALE') || healthy.length !== 0) {
    fail('CORE_CLOCK_PROOF_FAILED');
  }
  return { ok: true };
}

function proveNewModelFinding() {
  const now = Date.parse('2026-11-12T00:00:00Z');
  const findings = architectureFindings({
    received_at: now, report: { new_models: ['@cf/example/new-free'], max_lines: 1500 },
  }, { now });
  if (!findings.some(row => row.code === 'UPGRADE_MODEL_AVAILABLE' && row.detail.includes('@cf/example/new-free'))) {
    fail('NEW_MODEL_FINDING_PROOF_FAILED');
  }
  return { ok: true };
}

async function proveRuntimeLease() {
  const store = new Map();
  const now = 1_000_000;
  const first = await tryAcquireAutonomyRuntimeLease({ memoryStore: store, owner: 'owner-a', now });
  const busy = await tryAcquireAutonomyRuntimeLease({ memoryStore: store, owner: 'owner-b', now: now + 1_000 });
  await beginAutonomyCheckpoint({ memoryStore: store, owner: 'owner-a', jobId: 'job-7', step: 'write', now });
  const pending = await pendingAutonomyCheckpoint({ memoryStore: store });
  const resumedOwner = await tryAcquireAutonomyRuntimeLease({ memoryStore: store, owner: 'owner-c', now: now + 120_000 });
  const resumed = await beginAutonomyCheckpoint({ memoryStore: store, owner: 'owner-c', jobId: 'job-7', step: 'write', now: now + 120_000 });
  if (!first.acquired || busy.acquired || pending?.job_id !== 'job-7' || pending.step !== 'write' || !resumedOwner.acquired || !resumed.resumed || resumed.checkpoint.attempts !== 2) {
    fail('RUNTIME_LEASE_PROOF_FAILED');
  }
  return { ok: true };
}

async function proveIsolatedRestore() {
  const exported = {
    type: 'MEL_D1_LOGICAL_EXPORT_V1', tableCount: 3,
    tables: [
      { name: 'evolution_ledger', schema: 'ledger', rowCount: 1, rows: [{ event_id: 'e1' }] },
      { name: 'conversations', schema: 'conversations', rowCount: 1, rows: [{ id: 'c1' }] },
      { name: 'dev_jobs', schema: 'jobs', rowCount: 1, rows: [{ id: 'j1' }] },
    ],
  };
  const refused = await verifyIsolatedRestore(exported, { isolated: false, production: true, restore: async () => exported });
  const restored = await verifyIsolatedRestore(exported, { isolated: true, production: false, restore: async data => data });
  if (refused.ok !== false || refused.production_written !== false || restored.identical !== true || restored.production_written !== false) {
    fail('ISOLATED_RESTORE_PROOF_FAILED');
  }
  return { ok: true };
}

function proveChatMediaChain() {
  const key = 'generated/2026-11-12/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png.enc';
  const row = { status: 'SUCCEEDED', capability: 'media.image.generate', result: { ok: true, artifact: { stored: true, stored_encrypted: true, private: true, key, mime: 'image/png' } } };
  const media = collectChatMedia([row, row]);
  if (media.media.length !== 1 || media.media[0].private !== true || media.media[0].artifact_key !== key) fail('CHAT_MEDIA_CHAIN_PROOF_FAILED');
  return { ok: true };
}

function proveVisionScope() {
  const thumbnail = imageAnalysisCoverage({ input_kind: 'thumbnail', bytes_read: false });
  const full = imageAnalysisCoverage({ input_kind: 'bytes', bytes_read: true });
  if (thumbnail.complete !== false || thumbnail.error !== 'IMAGE_THUMBNAIL_ONLY' || full.complete !== true || full.scope !== 'FULL') {
    fail('VISION_SCOPE_PROOF_FAILED');
  }
  return { ok: true };
}

function proveCouncilCatalog() {
  const catalog = councilOperationalCatalog({ list: () => [
    { id: 'work.create', description: 'ouvrir un travail', enabled: true, permissions: ['work.write'], health: 'HEALTHY', risk: 'LOW' },
    { id: 'gmail.messages.search', description: 'absent du catalogue opérationnel', enabled: true },
  ] }, {});
  const work = councilRecommendationRequest({ kind: 'WORK', target: 'audit hebdomadaire', summary: 'proposer' }, { parentId: 'parent-1' });
  const again = councilRecommendationRequest({ kind: 'WORK', target: 'audit hebdomadaire' }, { parentId: 'parent-1' });
  if (!catalog.operations.some(row => row.id === 'work.create' && row.permissions.includes('work.write'))) fail('COUNCIL_CATALOG_PRESENT_PROOF_FAILED');
  if (catalog.operations.some(row => row.id === 'gmail.messages.search')) fail('COUNCIL_CATALOG_ABSENT_PROOF_FAILED');
  if (work.execute !== false || work.activate !== false || work.authorized !== false || work.status !== 'PROPOSED' || work.idempotency_key !== again.idempotency_key) {
    fail('COUNCIL_RECOMMENDATION_PROOF_FAILED');
  }
  return { ok: true };
}

export const SOFTWARE_CONTRACT_PROOFS = Object.freeze([
  { roadmapId: 'MEL-LIFE-01', id: 'continuity.life-contingency.verify', name: 'Contre-mesure de continuité', prove: proveLifeContingency },
  { roadmapId: 'MEL-AUDIT-02', id: 'audit.development.verify', name: 'Audit de développement dédupliqué', prove: proveDevelopmentAudit },
  { roadmapId: 'MEL-AUDIT-03', id: 'audit.domain-findings.verify', name: 'Trois constats de domaine', prove: proveDomainFindings },
  { roadmapId: 'MEL-AUDIT-04', id: 'audit.architecture-report.verify', name: 'Rapport d’architecture signé une fois', prove: proveArchitectureReport },
  { roadmapId: 'MEL-AUDIT-05', id: 'audit.core-clock.verify', name: 'Horloge injectée du noyau', prove: proveCoreClock },
  { roadmapId: 'MEL-AUDIT-06', id: 'audit.new-model.verify', name: 'Modèle nouveau signalé', prove: proveNewModelFinding },
  { roadmapId: 'MEL-AUDIT-07', id: 'audit.outcome-loop.verify', name: 'Mesure avant et après réparation', prove: proveOutcomeLoop },
  { roadmapId: 'MEL-FOUNDER-02', id: 'autonomy.runtime-lease.verify', name: 'Reprise du même bail', prove: proveRuntimeLease },
  { roadmapId: 'MEL-FOUNDER-07', id: 'backup.isolated-restore.verify', name: 'Restauration isolée', prove: proveIsolatedRestore },
]);

export function registerSoftwareContractProofs(bus) {
  for (const proof of SOFTWARE_CONTRACT_PROOFS) {
    bus.discover({
      id: proof.id, name: proof.name, category: 'diagnostic', version: '1.0.0', provider: 'core',
      description: 'Rejoue le contrôle logiciel du contrat. N’appelle aucun modèle et ne certifie ni appareil ni LoRA.',
      input_schema: { type: 'object', additionalProperties: false },
      output_schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
      risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
    }, async () => proof.prove());
  }
}

export async function runSoftwareContractProofs(bus) {
  const results = [];
  for (const proof of SOFTWARE_CONTRACT_PROOFS) {
    try {
      await bus.execute(proof.id, {}, { owner: 'roadmap-proof' });
      results.push({ id: proof.roadmapId, ok: true });
    } catch (error) {
      results.push({ id: proof.roadmapId, ok: false, code: String(error?.code || 'SOFTWARE_CONTRACT_PROOF_FAILED') });
    }
  }
  return results;
}
