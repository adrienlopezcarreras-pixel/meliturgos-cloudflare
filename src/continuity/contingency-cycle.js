import { currentContingency } from './contingency-plan.js';
import { applyDueLifeCountermeasures, trialReplacement } from './life-contingency.js';
import { attestedReplacementReadiness, REPLACEMENT_CATALOG } from './replacement-catalog.js';

// Every scenario countermeasure has one handler. A handler may record the
// decision without switching a brick: a dead worker cannot move itself, and an
// unproven host is never activated.
const HANDLERS = Object.freeze({
  KEEP_MAX_ON_CLOUDFLARE: 'stay',
  DO_NOT_EXPECT_LOCAL_STANDBY: 'note',
  DO_NOT_DEPLOY: 'note',
  USE_OTHER_PROVEN_MODEL: 'model',
  KEEP_REMAINING_PRIVATE_KIT: 'note',
  DO_NOT_USE_PUBLIC_SHARDS_AS_KEY: 'note',
  MOVE_MAX_TO_PC: 'handoff',
  RUN_CODE_ON_GITHUB_ACTIONS: 'relay',
  SITE_AND_MEMORY_STAY_DOWN: 'note',
  STOP_AND_REBUILD_FROM_PRIVATE_KIT: 'rebuild',
  STOP_MEMORY_KEY_UNAVAILABLE: 'note',
  PUBLIC_MAP_ONLY: 'note',
});

export function contingencyHandlers() {
  return Object.freeze({ ...HANDLERS });
}

async function note(actions, code) {
  if (typeof actions?.note !== 'function') {
    return { applied: false, activation_performed: false, code, reason: 'NOTE_EXECUTOR_REQUIRED' };
  }
  const result = await actions.note(code);
  return { applied: result?.ok === true, activation_performed: false, code, reason: result?.code || null };
}

export async function runContingencyCycle({
  observed = {}, life = {}, actions = {}, replacements = [],
  // Untrusted observations can recommend a rebuild, not authorize one.
  ownerApprovedRecovery = false,
  replacementAttestations = [], replacementAttestationConfig = {},
} = {}) {
  const scenario = currentContingency(observed);
  const ran = [];
  // Mission-supplied measurements are untrusted until the external signer,
  // deployed SHA, observer and complete probe set all verify.
  const reports = Array.isArray(replacementAttestations) ? replacementAttestations.slice(0, 100) : [];
  const candidateIds = new Set();
  const certifications = [];
  for (const row of reports) {
    const part = String(row?.part || ''), candidate = String(row?.candidate || '');
    if (!REPLACEMENT_CATALOG[part]?.candidates.includes(candidate)) continue;
    const key = part + ':' + candidate;
    if (candidateIds.has(key)) continue;
    candidateIds.add(key);
    if (candidateIds.size > 16) break;
    certifications.push(await attestedReplacementReadiness(part, candidate, reports, replacementAttestationConfig));
  }
  if (scenario.kind !== 'NONE') {
    for (const code of scenario.countermeasure) {
      const kind = HANDLERS[code];
      if (!kind) {
        ran.push({ code, applied: false, activation_performed: false, reason: 'NO_HANDLER' });
        continue;
      }
      if (kind === 'stay' || kind === 'note') {
        try {
          ran.push({ code, ...(await note(actions, code)) });
        } catch (error) {
          ran.push({ code, applied: false, activation_performed: false, reason: String(error?.code || 'NOTE_FAILED') });
        }
        continue;
      }
      if (kind === 'model') {
        const proven = certifications.find(row => row.part === 'model' && row.ready === true);
        ran.push(proven
          ? { code, applied: false, activation_performed: false, reason: 'PROVEN_MODEL_NOT_SWITCHED' }
          : { code, applied: false, activation_performed: false, reason: 'NO_PROVEN_REPLACEMENT' });
        continue;
      }
      if (kind === 'handoff') {
        ran.push({ code, applied: false, activation_performed: false, reason: scenario.max === 'STANDBY_READY' ? 'PC_HANDOFF_NOT_EXECUTED' : 'STANDBY_NOT_READY' });
        continue;
      }
      if (kind === 'relay') {
        ran.push({ code, applied: false, activation_performed: false, reason: 'ACTIONS_RELAY_NOT_EXECUTED' });
        continue;
      }
      if (kind === 'rebuild') {
        // Availability of a private kit is NOT permission to deploy or rebuild.
        if (ownerApprovedRecovery !== true) {
          ran.push({ code, applied: false, activation_performed: false, reason: 'OWNER_APPROVAL_REQUIRED' });
          continue;
        }
        if (typeof actions.rebuild !== 'function') {
          ran.push({ code, applied: false, activation_performed: false, reason: 'PRIVATE_KIT_REQUIRED' });
          continue;
        }
        try {
          const result = await actions.rebuild();
          const verified = result?.ok === true && result?.restored === true
            && result?.integrity_verified === true;
          ran.push({ code, applied: verified, activation_performed: verified,
            reason: verified ? 'FULL_REBUILD_VERIFIED' : result?.code || 'FULL_REBUILD_NOT_VERIFIED' });
        } catch (error) {
          ran.push({ code, applied: false, activation_performed: false, reason: String(error?.code || 'REBUILD_FAILED') });
        }
      }
    }
  }
  const lifeResults = await applyDueLifeCountermeasures(life, actions);
  const trials = (Array.isArray(replacements) ? replacements : []).map(row => trialReplacement(row));
  return Object.freeze({
    schema: 'mel.contingency-cycle/v1',
    scenario,
    ran: Object.freeze(ran),
    life: Object.freeze(lifeResults),
    replacements: Object.freeze(trials),
    replacement_certifications: Object.freeze(certifications),
    activation_performed: ran.some(row => row.activation_performed === true) || lifeResults.some(row => row.activation_performed === true),
  });
}
