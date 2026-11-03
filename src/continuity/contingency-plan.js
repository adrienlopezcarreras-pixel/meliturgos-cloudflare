const PARTS = Object.freeze({
  cloudflare: 'runner',
  pc: 'runner',
  github: 'source',
  model: 'mind',
  gmail: 'kit',
  onedrive: 'kit',
  shards: 'public',
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function normalizeDown(down) {
  const names = [...new Set((Array.isArray(down) ? down : [down]).map(part => String(part || '').trim().toLowerCase()).filter(Boolean))];
  if (!names.length) fail('CONTINGENCY_SCENARIO_REQUIRED');
  for (const name of names) if (!PARTS[name]) fail('CONTINGENCY_PART_UNKNOWN');
  return names;
}

export function contingencyPrinciples() {
  return Object.freeze({
    schema: 'mel.contingency/v1',
    classes: Object.freeze(['SINGLE', 'CHAIN', 'TOTAL']),
    rules: Object.freeze([
      'Une panne n arrete que la brique tombee.',
      'Une panne en chaine se traite dans l ordre, sans inventer un hote.',
      'Tout en panne, Gmail ou OneDrive suffit. Les shards publics n ont pas la cle.',
      'MAX reste sur Cloudflare tant qu il repond. S il tombe, le PC prend le relais s il est pret. Sinon GitHub Actions prend le code. Si GitHub tombe aussi, plus aucun moteur.',
      'Une candidate n est meilleure qu apres un essai logiciel ou physique.',
      'Le moindre probleme autorise un plan de renaissance, pas une bascule sans cible prouvee.',
    ]),
  });
}

export function maxStandby({ cloudflareUp = true, companionOnline = false, localGit = false, localDb = false, localModel = false } = {}) {
  if (cloudflareUp === true) {
    return Object.freeze({ status: 'MAX_ON_CLOUDFLARE', standby_required: false, activation_performed: false });
  }
  const missing = [];
  if (companionOnline !== true) missing.push('pc');
  if (localGit !== true) missing.push('local-git');
  if (localDb !== true) missing.push('local-db');
  if (localModel !== true) missing.push('local-model');
  if (missing.length) {
    return Object.freeze({ status: 'STANDBY_NOT_READY', missing: Object.freeze(missing), activation_performed: false });
  }
  return Object.freeze({ status: 'STANDBY_READY', runner: 'local-companion', activation_performed: false });
}

export function respondToScenario({ down, standby = {} } = {}) {
  const names = normalizeDown(down);
  const fallen = new Set(names);
  const kind = names.length === 1 ? 'SINGLE' : (fallen.has('cloudflare') && fallen.has('github') && fallen.has('pc')) ? 'TOTAL' : 'CHAIN';
  const privateKitLeft = ['gmail', 'onedrive'].filter(part => !fallen.has(part));
  const cloudflareUp = !fallen.has('cloudflare');
  // An observed PC outage overrides any stale standby-ready assertion.
  const standbyState = maxStandby({ ...standby, cloudflareUp, ...(fallen.has('pc') ? { companionOnline: false } : {}) });
  const implication = [
    fallen.has('cloudflare') ? 'Le site et le tick cloud s arretent.' : 'Cloudflare peut encore faire tourner MAX.',
    fallen.has('github') ? 'Le depot et la carte hebergee la deviennent illisibles.' : 'GitHub reste lisible.',
    fallen.has('pc') ? 'Le secours local s arrete.' : 'Le PC peut servir de secours.',
    fallen.has('model') ? 'Ce modele ne repond plus.' : null,
    fallen.has('gmail') ? 'La copie Gmail est inaccessible.' : 'Gmail peut encore porter une copie complete.',
    fallen.has('onedrive') ? 'La copie OneDrive est inaccessible.' : 'OneDrive peut encore porter une copie complete.',
    fallen.has('shards') ? 'La carte publique est inaccessible.' : 'Les shards publics gardent la carte, pas la cle.',
  ].filter(Boolean).join(' ');
  let consequence;
  let max = standbyState.status;
  const countermeasure = [];
  if (cloudflareUp) {
    countermeasure.push('KEEP_MAX_ON_CLOUDFLARE');
    if (fallen.has('pc')) countermeasure.push('DO_NOT_EXPECT_LOCAL_STANDBY');
    if (fallen.has('github')) countermeasure.push('DO_NOT_DEPLOY');
    if (fallen.has('model')) countermeasure.push('USE_OTHER_PROVEN_MODEL');
    if (fallen.has('gmail') || fallen.has('onedrive')) countermeasure.push('KEEP_REMAINING_PRIVATE_KIT');
    if (fallen.has('shards')) countermeasure.push('DO_NOT_USE_PUBLIC_SHARDS_AS_KEY');
    consequence = 'MAX reste sur Cloudflare. Aucune bascule.';
    max = 'MAX_ON_CLOUDFLARE';
  } else if (standbyState.status === 'STANDBY_READY') {
    countermeasure.push('MOVE_MAX_TO_PC', 'DO_NOT_DEPLOY');
    consequence = 'MAX continue sur le PC. On ne deploie plus vers Cloudflare.';
    max = 'STANDBY_READY';
  } else if (!fallen.has('github')) {
    countermeasure.push('RUN_CODE_ON_GITHUB_ACTIONS', 'SITE_AND_MEMORY_STAY_DOWN');
    consequence = 'Le PC n est pas la. GitHub Actions prend le relais du code. Le site et la memoire Cloudflare restent arretes.';
    max = 'ACTIONS_RELAY_READY';
  } else if (privateKitLeft.length) {
    countermeasure.push('STOP_AND_REBUILD_FROM_PRIVATE_KIT');
    consequence = 'Aucun moteur ne reste. Une autre machine pourra la relancer depuis ' + privateKitLeft.join(' ou ') + '.';
    max = 'NO_RUNNER';
  } else {
    countermeasure.push('STOP_MEMORY_KEY_UNAVAILABLE');
    if (!fallen.has('shards')) countermeasure.push('PUBLIC_MAP_ONLY');
    consequence = 'Aucun moteur ne reste. Sans Gmail ni OneDrive, la memoire ne s ouvre pas. Les shards publics ne contiennent pas la cle.';
    max = 'NO_RUNNER';
  }
  if (!cloudflareUp && fallen.has('model')) countermeasure.push('USE_OTHER_PROVEN_MODEL');
  if (!cloudflareUp && privateKitLeft.length && (fallen.has('gmail') || fallen.has('onedrive'))) countermeasure.push('KEEP_REMAINING_PRIVATE_KIT');
  return Object.freeze({
    schema: 'mel.contingency-response/v1',
    kind,
    down: Object.freeze(names),
    implication,
    consequence,
    countermeasure: Object.freeze(countermeasure),
    max,
    private_kits_left: Object.freeze(privateKitLeft),
    rebirth: privateKitLeft.length ? 'FROM_PRIVATE_KIT' : 'MEMORY_KEY_UNAVAILABLE',
    activation_performed: false,
  });
}

export function allScenarios() {
  const parts = Object.keys(PARTS);
  const scenarios = [];
  for (let mask = 1; mask < (1 << parts.length); mask += 1) {
    const down = parts.filter((_, index) => mask & (1 << index));
    scenarios.push(respondToScenario({ down }));
  }
  return Object.freeze(scenarios);
}

export function currentContingency(observed = {}) {
  const flags = {
    cloudflare: observed.cloudflareUp,
    // A disconnected optional Companion is not evidence that the PC failed.
    pc: observed.pcUp === false ? false : (observed.pcUp === true ? true : undefined),
    github: observed.githubUp,
    model: observed.modelUp,
    gmail: observed.gmailUp,
    onedrive: observed.onedriveUp,
    shards: observed.shardsUp,
  };
  const down = Object.entries(flags).filter(([, up]) => up === false).map(([name]) => name);
  if (!down.length) {
    return Object.freeze({
      schema: 'mel.contingency-response/v1',
      kind: 'NONE',
      down: Object.freeze([]),
      implication: 'Aucune panne observee.',
      consequence: 'MAX reste ou elle est. Aucune bascule.',
      max: 'MAX_ON_CLOUDFLARE',
      activation_performed: false,
    });
  }
  const plan = respondToScenario({
    down,
    standby: {
      // A local standby needs a positive, current PC observation, not merely
      // an absent failure report or a stale Companion heartbeat.
      companionOnline: observed.pcUp === true && observed.companionOnline === true,
      localGit: observed.localGit === true,
      localDb: observed.localDb === true,
      localModel: observed.localModel === true,
    },
  });
  if (plan.max === 'ACTIONS_RELAY_READY' && observed.githubRelayReady !== true) {
    // GitHub being reachable does not prove the Actions relay is configured,
    // authorised and has passed an independent code execution drill.
    return Object.freeze({
      ...plan,
      max: 'ACTIONS_RELAY_UNVERIFIED',
      consequence: 'Le relais GitHub Actions n est pas certifie. Aucun moteur de remplacement ne peut etre declare actif.',
      verification_required: Object.freeze(['GITHUB_RELAY_LIVE_TEST']),
      activation_performed: false,
    });
  }
  if (plan.max === 'NO_RUNNER' && plan.rebirth === 'FROM_PRIVATE_KIT') {
    // Provider reachability is not evidence of a restorable private backup.
    const verified = plan.private_kits_left.filter(part =>
      observed[part + 'Up'] === true && observed[part + 'KitVerified'] === true);
    if (!verified.length) {
      return Object.freeze({
        ...plan,
        rebirth: 'PRIVATE_KIT_UNVERIFIED',
        countermeasure: Object.freeze(['DO_NOT_DEPLOY', 'DO_NOT_USE_PUBLIC_SHARDS_AS_KEY']),
        consequence: 'Aucun moteur ne reste et aucune restauration du kit prive n est prouvee. Reconstruction bloquee.',
        verification_required: Object.freeze(['PRIVATE_KIT_RESTORE_DRILL']),
        activation_performed: false,
      });
    }
    return Object.freeze({ ...plan, verified_private_kits: Object.freeze(verified) });
  }
  return plan;
}

export function judgeCandidate({ research = {} } = {}) {
  const kind = String(research.kind || '').trim().toUpperCase();
  if (!['DOCUMENTARY', 'DOCUMENTAIRE', 'SOFTWARE', 'LOGICIELLE', 'PHYSICAL', 'PHYSIQUE'].includes(kind)) {
    return Object.freeze({ better: false, status: 'RESEARCH_KIND_UNKNOWN', activation_allowed: false });
  }
  if (kind === 'DOCUMENTARY' || kind === 'DOCUMENTAIRE') {
    const sources = (Array.isArray(research.sources) ? research.sources : []).filter(row => /^https:\/\//i.test(String(row?.url || '')));
    if (!sources.length) return Object.freeze({ better: false, status: 'DOCUMENTS_MISSING', activation_allowed: false });
    return Object.freeze({ better: null, status: 'DOCUMENTED_NOT_TESTED', activation_allowed: false });
  }
  if (research.available !== true || research.reliable !== true) {
    return Object.freeze({ better: false, status: 'NOT_AVAILABLE', activation_allowed: false });
  }
  if (research.smoke !== true) return Object.freeze({ better: false, status: 'TEST_FAILED', activation_allowed: false });
  const better = research.measured_better === true;
  return Object.freeze({ better, status: better ? 'BETTER_PROVEN' : 'NOT_BETTER', activation_allowed: false });
}

export function buildReconstructionKit({ sourceSha, encryptedBackup, keyId, keyB64, index, createdAt = new Date().toISOString() } = {}) {
  const sha = String(sourceSha || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) fail('RECONSTRUCTION_SOURCE_SHA_INVALID');
  if (index?.format !== 'MEL-ShardVault-DiscoveryIndex') fail('RECONSTRUCTION_MAP_INVALID');
  const backup = String(encryptedBackup || '');
  const id = String(keyId || '').trim();
  const key = String(keyB64 || '').trim();
  if (!backup || !id || !key) fail('RECONSTRUCTION_BACKUP_KEY_REQUIRED');
  return {
    schema: 'mel.reconstruction-kit/v1',
    created_at: createdAt,
    source_sha: sha,
    sufficient_alone: true,
    notice: 'Ce fichier suffit pour reconstruire MEL, y compris la cle.',
    index,
    backup: { encrypted_text: backup, key_id: id, key_b64: key },
  };
}

export function publicShardKit(kit) {
  if (kit?.schema !== 'mel.reconstruction-kit/v1') fail('RECONSTRUCTION_KIT_INVALID');
  const backup = { ...(kit.backup || {}) };
  delete backup.key_b64;
  return { ...kit, sufficient_alone: false, private_key_included: false, backup, notice: 'Copie publique: carte et sauvegarde, sans la cle.' };
}

export function placeReconstructionCopies(kit) {
  if (kit?.sufficient_alone !== true || !kit?.backup?.key_b64) fail('RECONSTRUCTION_KIT_INVALID');
  return {
    gmail: { name: 'MEL-RECONSTRUCTION-KIT', body: kit, sufficient_alone: true },
    onedrive: { name: 'MEL-RECONSTRUCTION-KIT.json', body: kit, sufficient_alone: true },
    shards: { name: 'MEL-RECONSTRUCTION-PUBLIC.json', body: publicShardKit(kit), sufficient_alone: false },
  };
}
