// Bounded software proofs for open roadmap rows. Each one re-runs the
// decision the contract already specifies. None calls a model, writes
// production data, or claims a device or a real LoRA run.
import { inferChatMediaCapability } from '../api/chat-media-intent.js';
import { buildResponseQualityInstruction, extractSubRequests } from '../api/response-quality.js';
import { actionsRelayDecision, applyLifeCountermeasure, respondToLifeEvent } from '../continuity/life-contingency.js';
import { measureOutcomeRepairs, recordRepairs } from '../diagnostics/outcome-loop.js';
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

export const SOFTWARE_CONTRACT_PROOFS = Object.freeze([
  { roadmapId: 'MEL-CHAT-01', id: 'chat.media-intent.verify', name: 'Intention média du chat', prove: proveChatMediaIntent },
  { roadmapId: 'MEL-CHAT-07', id: 'chat.response-quality.verify', name: 'Sous-demandes et recette de preuve', prove: proveResponseQuality },
  { roadmapId: 'MEL-LIFE-01', id: 'continuity.life-contingency.verify', name: 'Contre-mesure de continuité', prove: proveLifeContingency },
  { roadmapId: 'MEL-AUDIT-07', id: 'audit.outcome-loop.verify', name: 'Mesure avant et après réparation', prove: proveOutcomeLoop },
  { roadmapId: 'MEL-MANIFEST-01', id: 'roadmap.manifest-foundation.verify', name: 'Fondations du manifeste', prove: proveManifestFoundation },
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
