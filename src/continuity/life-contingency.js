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
