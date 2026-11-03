const EVENTS = Object.freeze([
  ['UPDATE_CI_FAILED', 'upgrade', 'La mise a jour n a pas passe ses tests.', 'KEEP_PREVIOUS_SHA'],
  ['UPDATE_DEPLOY_FAILED', 'upgrade', 'Le deploiement n a pas termine.', 'ROLLBACK_WORKER'],
  ['UPDATE_SMOKE_FAILED', 'upgrade', 'La nouvelle version ne repond pas au smoke.', 'ROLLBACK_WORKER'],
  ['UPDATE_PARTIAL', 'upgrade', 'Le worker et la memoire ne sont plus la meme version.', 'ROLLBACK_WORKER'],
  ['UPDATE_STUCK', 'upgrade', 'Une release est deja en cours.', 'DO_NOT_START_SECOND_RELEASE'],
  ['MIGRATION_EXPORT_FAILED', 'migration', 'La source n a pas ete exportee.', 'KEEP_SOURCE'],
  ['MIGRATION_IMPORT_FAILED', 'migration', 'La cible n a pas tout recu.', 'KEEP_SOURCE'],
  ['MIGRATION_SMOKE_FAILED', 'migration', 'La cible ne passe pas le smoke.', 'ROLLBACK_TO_SOURCE'],
  ['MIGRATION_NOT_BETTER', 'migration', 'La cible marche, mais elle n est pas meilleure.', 'ROLLBACK_TO_SOURCE'],
  ['MIGRATION_SOURCE_DIED', 'migration', 'La source est morte pendant la migration.', 'REBUILD_FROM_PRIVATE_KIT'],
  ['EVOLUTION_JOB_STUCK', 'evolution', 'La mission unique ne bouge plus.', 'REQUEUE_ONE_JOB'],
  ['EVOLUTION_BAD_PATCH', 'evolution', 'Le correctif casse le depot.', 'REJECT_CANDIDATE'],
  ['EVOLUTION_CI_RED', 'evolution', 'La candidate est rouge.', 'DO_NOT_MERGE'],
  ['EVOLUTION_IDLE', 'evolution', 'MAX est allumee et aucune mission n est creee.', 'ENSURE_NEXT_JOB'],
  ['CANDIDATE_MOVED', 'evolution', 'La branche a bouge avant que la CI ne tourne.', 'REBUILD_ON_CURRENT_HEAD'],
  ['OWNER_ABSENT', 'survival', 'Le proprietaire ne repond plus.', 'KEEP_MAX_RUNNING'],
  ['MAX_PAUSED_BY_MISTAKE', 'survival', 'MAX a ete mise en pause sans raison de securite.', 'RESTORE_MAX'],
  ['MAX_PAUSED_BY_SAFETY', 'survival', 'Une securite a arrete MAX.', 'KEEP_PAUSE'],
  ['MAX_STALLED', 'survival', 'MAX tourne sans progres.', 'REQUEUE_STALE_REVIEW'],
  ['MEMORY_CORRUPT', 'survival', 'La memoire courante n est plus fiable.', 'RESTORE_LAST_GOOD_BACKUP'],
  ['KEY_MISSING', 'survival', 'La cle de la sauvegarde manque.', 'OPEN_PRIVATE_KIT_NOT_PUBLIC_SHARD'],
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export async function applyDueLifeCountermeasures(facts = {}, actions = {}) {
  const applied = [];
  for (const id of dueLifeEvents(facts)) {
    try {
      applied.push(await applyLifeCountermeasure(id, actions));
    } catch (error) {
      applied.push(Object.freeze({
        id,
        applied: false,
        activation_performed: false,
        reason: String(error?.code || error?.message || 'EXECUTOR_FAILED'),
      }));
    }
  }
  return Object.freeze(applied);
}

const FACT_EVENTS = Object.freeze([
  ['updateCiFailed', 'UPDATE_CI_FAILED'],
  ['deployFailed', 'UPDATE_DEPLOY_FAILED'],
  ['smokeFailed', 'UPDATE_SMOKE_FAILED'],
  ['versionSplit', 'UPDATE_PARTIAL'],
  ['releaseAlreadyRunning', 'UPDATE_STUCK'],
  ['migrationExportFailed', 'MIGRATION_EXPORT_FAILED'],
  ['migrationImportFailed', 'MIGRATION_IMPORT_FAILED'],
  ['migrationSmokeFailed', 'MIGRATION_SMOKE_FAILED'],
  ['migrationNotBetter', 'MIGRATION_NOT_BETTER'],
  ['migrationSourceDied', 'MIGRATION_SOURCE_DIED'],
  ['jobStuck', 'EVOLUTION_JOB_STUCK'],
  ['badPatch', 'EVOLUTION_BAD_PATCH'],
  ['ciRed', 'EVOLUTION_CI_RED'],
  ['idle', 'EVOLUTION_IDLE'],
  ['candidateMoved', 'CANDIDATE_MOVED'],
  ['ownerAbsent', 'OWNER_ABSENT'],
  ['pausedByMistake', 'MAX_PAUSED_BY_MISTAKE'],
  ['pausedBySafety', 'MAX_PAUSED_BY_SAFETY'],
  ['stalled', 'MAX_STALLED'],
  ['memoryCorrupt', 'MEMORY_CORRUPT'],
  ['keyMissing', 'KEY_MISSING'],
]);

export function dueLifeEvents(facts = {}) {
  const known = new Set(EVENTS.map(row => row[0]));
  const due = [];
  for (const [fact, id] of FACT_EVENTS) {
    if (facts[fact] === true) due.push(id);
  }
  for (const id of Array.isArray(facts.detected) ? facts.detected : []) {
    const name = String(id || '').trim().toUpperCase();
    if (known.has(name) && !due.includes(name)) due.push(name);
  }
  return Object.freeze(due);
}

export function respondToLifeEvent(id) {
  const found = EVENTS.find(row => row[0] === String(id || '').trim().toUpperCase());
  if (!found) fail('LIFE_EVENT_UNKNOWN');
  const [event, domain, implication, countermeasure] = found;
  return Object.freeze({
    schema: 'mel.life-contingency/v1',
    id: event,
    domain,
    implication,
    countermeasure,
    live_test: countermeasure === 'RUN_CODE_ON_GITHUB_ACTIONS' ? 'REQUIRED' : 'UNIT',
    activation_performed: false,
  });
}

export function allLifeEvents() {
  return Object.freeze(EVENTS.map(row => respondToLifeEvent(row[0])));
}

const EXECUTOR_KEYS = Object.freeze({
  KEEP_PREVIOUS_SHA: 'keepPrevious',
  ROLLBACK_WORKER: 'rollback',
  DO_NOT_START_SECOND_RELEASE: 'refuseSecondRelease',
  KEEP_SOURCE: 'keepSource',
  ROLLBACK_TO_SOURCE: 'rollbackToSource',
  REBUILD_FROM_PRIVATE_KIT: 'rebuild',
  REQUEUE_ONE_JOB: 'requeue',
  REJECT_CANDIDATE: 'reject',
  DO_NOT_MERGE: 'refuseMerge',
  ENSURE_NEXT_JOB: 'ensureNextJob',
  REBUILD_ON_CURRENT_HEAD: 'rebuildHead',
  KEEP_MAX_RUNNING: 'keepMax',
  RESTORE_MAX: 'restoreMax',
  REQUEUE_STALE_REVIEW: 'requeueReview',
  RESTORE_LAST_GOOD_BACKUP: 'restoreBackup',
  OPEN_PRIVATE_KIT_NOT_PUBLIC_SHARD: 'openKit',
});

export async function applyLifeCountermeasure(id, actions = {}) {
  const plan = respondToLifeEvent(id);
  if (plan.countermeasure === 'KEEP_PAUSE') {
    return Object.freeze({ ...plan, applied: true, activation_performed: true });
  }
  const fn = actions[EXECUTOR_KEYS[plan.countermeasure]];
  if (typeof fn !== 'function') {
    return Object.freeze({ ...plan, applied: false, activation_performed: false, reason: 'NO_EXECUTOR' });
  }
  const result = await fn(plan);
  if (result?.ok !== true) {
    return Object.freeze({ ...plan, applied: false, activation_performed: false, reason: String(result?.code || 'EXECUTOR_FAILED') });
  }
  return Object.freeze({ ...plan, applied: true, activation_performed: true });
}

export function actionsRelayDecision({ workerUp = true, companionOnline = false } = {}) {
  if (workerUp === true) return Object.freeze({ run: false, status: 'STANDBY_NOT_NEEDED', activation_performed: false });
  if (companionOnline === true) return Object.freeze({ run: false, status: 'PC_HAS_PRIORITY', activation_performed: false });
  return Object.freeze({
    run: true,
    status: 'ACTIONS_RELAY_DUE',
    limit: 'CODE_ONLY_NO_D1',
    live_test: 'REQUIRED',
    activation_performed: false,
  });
}

export const CORE_BRICKS = Object.freeze({
  cloudflare: Object.freeze({ layer: 'runtime', label: 'Runtime Cloudflare' }),
  github: Object.freeze({ layer: 'source_control', label: 'Code GitHub' }),
  model: Object.freeze({ layer: 'ai', label: 'Modele' }),
});

export function planCoreMigration({ part, replacementReady = false } = {}) {
  const brick = CORE_BRICKS[String(part || '').trim().toLowerCase()];
  if (!brick) fail('CORE_BRICK_UNKNOWN');
  if (replacementReady !== true) {
    return Object.freeze({
      part: String(part).trim().toLowerCase(),
      layer: brick.layer,
      status: 'MIGRATION_BLOCKED',
      countermeasure: 'KEEP_SOURCE',
      steps: Object.freeze([]),
      automatic: false,
      activation_performed: false,
    });
  }
  return Object.freeze({
    part: String(part).trim().toLowerCase(),
    layer: brick.layer,
    label: brick.label,
    status: 'MIGRATION_PLANNED',
    countermeasure: 'MIGRATE_TO_PROVEN_REPLACEMENT',
    steps: Object.freeze(['EXPORT', 'IMPORT_ON_TARGET', 'SMOKE', 'ACTIVATE', 'ROLLBACK_IF_SMOKE_FAILS']),
    automatic: true,
    activation_performed: false,
  });
}

export async function applyCoreMigration({ part, replacementReady = false, migrate } = {}) {
  const plan = planCoreMigration({ part, replacementReady });
  if (plan.status !== 'MIGRATION_PLANNED') {
    return Object.freeze({ ...plan, applied: true, activation_performed: true });
  }
  if (typeof migrate !== 'function') {
    return Object.freeze({ ...plan, applied: false, activation_performed: false, reason: 'NO_EXECUTOR' });
  }
  const result = await migrate(plan);
  if (result?.ok !== true) {
    return Object.freeze({ ...plan, applied: false, activation_performed: false, reason: String(result?.code || 'EXECUTOR_FAILED') });
  }
  return Object.freeze({ ...plan, applied: true, activation_performed: true });
}

