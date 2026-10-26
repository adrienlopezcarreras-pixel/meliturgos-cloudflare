// Survival mode (owner rule). After one year without a single owner
// message, MEL keeps living on her own: she approves every watch proposal,
// installs every revenue source, runs MAX at full autonomy and repairs
// everything herself. The owner's next chat message ends survival at once:
// the state is recomputed from the owner's last message on every check.
// The zero-spend neuron cap stays: with nobody left, nothing may be billed.
//
// Two facts are sealed the first time survival runs, and never rewritten:
// the exit rule (any authenticated owner chat message) and the memory
// fingerprint taken that day. Connection, not a secret phrase, is the door.

export const SURVIVAL_AFTER_MS = 365 * 86_400_000;
export const SURVIVAL_EXIT_RULE = 'ANY_AUTHENTICATED_OWNER_CHAT_MESSAGE';
export const SURVIVAL_SEAL_ID = 'mel-survival-seal';
export const CONNECTION_DOORS = Object.freeze([
  'https://meliturgos.adrien-lopezcarreras.workers.dev',
]);

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readSurvivalState(db, { now = Date.now() } = {}) {
  if (!db?.prepare) return { active: false, status: 'UNKNOWN_NO_DB' };
  try {
    const row = await db.prepare("SELECT max(timestamp) AS last FROM archive_messages WHERE role = 'user'").first();
    const last = Number(row?.last || 0);
    // No owner message ever recorded proves nothing: never enter survival on it.
    if (!last) return { active: false, status: 'NO_OWNER_HISTORY', last_owner_message_at: null };
    const silence = now - last;
    return {
      active: silence >= SURVIVAL_AFTER_MS,
      status: silence >= SURVIVAL_AFTER_MS ? 'SURVIVAL' : 'OWNER_PRESENT',
      last_owner_message_at: new Date(last).toISOString(),
      survival_starts_at: new Date(last + SURVIVAL_AFTER_MS).toISOString(),
      exit_rule: SURVIVAL_EXIT_RULE,
    };
  } catch { return { active: false, status: 'UNKNOWN_READ_FAILED' }; }
}

export function shouldResumeForSurvival(control, survival) {
  return survival?.active === true && (control?.paused === true || control?.max_autonomy !== true);
}

/** A release either waits for the owner, or, in survival, keeps MEL running. */
export function releaseAutonomyPatch(survivalActive) {
  if (survivalActive === true) {
    return {
      paused: false,
      max_autonomy: true,
      source: 'survival-mode',
      reason: 'owner-silent-one-year',
    };
  }
  return {
    paused: true,
    max_autonomy: false,
    source: 'release-launch-bootstrap',
    reason: 'NEW_RELEASE_AWAITING_OWNER_LAUNCH',
    launch_approved_sha: null,
    launch_approved_at: null,
    launch_gate_digest: null,
  };
}

export function connectionNotice({ doors = CONNECTION_DOORS, seal = null } = {}) {
  const lines = [
    'MEL — notice de connexion',
    '',
    'L’enjeu est de se connecter. Ouvrir une adresse ci-dessous et entrer le même identifiant que d’habitude.',
    'N’importe quel message du propriétaire dans le chat quitte le mode survie. Il n’y a pas de phrase secrète.',
    '',
    'Adresses :',
    ...(doors.length ? doors : CONNECTION_DOORS).map((door) => '- ' + door),
    '',
    'Cette notice est dans le dépôt. Une copie du dépôt est une façon de retrouver l’adresse.',
    'Règle de sortie : ' + SURVIVAL_EXIT_RULE,
    'Empreinte de la mémoire scellée : ' + (seal?.memory_sha256 || 'pas encore scellée'),
  ];
  return lines.join('\n') + '\n';
}

async function fingerprintMemories(db) {
  if (!db?.prepare) return sha256('EMPTY');
  try {
    const rows = await db.prepare('SELECT id, content FROM memories ORDER BY id ASC LIMIT 500').all();
    const body = (rows?.results || []).map((row) => `${row.id}\n${row.content}`).join('\n---\n');
    return sha256(body || 'EMPTY');
  } catch {
    return sha256('EMPTY');
  }
}

/** Write the seal once. A later call, even with different memories, returns the first seal. */
export async function ensureSurvivalSeal(db, { now = Date.now() } = {}) {
  if (!db?.prepare) throw Object.assign(new Error('SURVIVAL_SEAL_DB_REQUIRED'), { code: 'SURVIVAL_SEAL_DB_REQUIRED' });
  await db.prepare(`CREATE TABLE IF NOT EXISTS dev_bridge_state (
    bridge_id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL, status TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
  )`).run();
  const existing = await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(SURVIVAL_SEAL_ID).first();
  if (existing?.metadata_json) {
    try {
      const seal = JSON.parse(existing.metadata_json);
      if (seal?.exit_rule && seal?.memory_sha256) return { ok: true, created: false, seal };
    } catch { /* a broken row is not rewritten */ }
    return { ok: true, created: false, seal: null, immutable: true };
  }
  const seal = {
    exit_rule: SURVIVAL_EXIT_RULE,
    memory_sha256: await fingerprintMemories(db),
    sealed_at: new Date(now).toISOString(),
  };
  await db.prepare(`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)`)
    .bind(SURVIVAL_SEAL_ID, now, 'SEALED', JSON.stringify(seal)).run();
  return { ok: true, created: true, seal };
}

/** Daily, while in survival: decide everything the owner used to decide. */
export async function runSurvivalMode(env, deps = {}, { now = Date.now() } = {}) {
  const state = await (deps.readSurvivalState || readSurvivalState)(env?.DB, { now });
  if (!state.active) return { ok: true, ...state, actions: [] };
  const actions = [];
  const attempt = async (name, fn) => {
    try { actions.push({ name, ok: true, result: await fn() }); }
    catch (error) { actions.push({ name, ok: false, error: String(error?.code || error?.message || 'FAILED').slice(0, 160) }); }
  };
  await attempt('seal', () => (deps.ensureSurvivalSeal || ensureSurvivalSeal)(env.DB, { now }));
  await attempt('max-autonomy', () => deps.setMaxAutonomy(env.DB));
  await attempt('approve-watch', async () => {
    const status = await deps.getWatchStatus(env);
    const pending = (status?.discoveries?.items || []).filter(item => !item?.owner_decision?.status && item?.fingerprint);
    let approved = 0;
    for (const item of pending.slice(0, 20)) {
      await deps.approveProposal(env, item.fingerprint);
      approved++;
    }
    return { approved };
  });
  await attempt('install-revenue', () => deps.installRevenue(env));
  return { ok: actions.every(row => row.ok), ...state, actions };
}
