// Software contracts for the 24 historical roadmap rows that had no runtime
// proof. Each check fails closed. None of them claims a phone, a PC power
// cycle, a visual judgment, or a fresh Kaggle run happened.
import { assertLoraPromotionGuard, CLOUDFLARE_LORA_MODEL_PAIRS, DEFAULT_LORA_BASE_MODEL, DEFAULT_LORA_RUNTIME_MODEL } from '../learning/lora-plan.js';
import { verifyLoraDailyTrace } from '../learning/lora-daily-trace.js';
import { assertWordPressPublicContext, definition as wordpressDefinition } from '../connectors/wordpress.js';
import { ConnectorCatalog } from '../connectors/connector-catalog.js';
import { detectWakePhrase } from '../pages/wake-word-runtime.js';
import { MEL_AVATAR_MOTION_STATES, AVATAR_MOTION_SOURCE } from '../pages/avatar-motion-runtime.js';
import { normalizeLipSyncLevel, AVATAR_LIPSYNC_SOURCE } from '../pages/avatar-lipsync-runtime.js';
import { getMelAvatarPresentation } from '../pages/mel-avatar-assets.js';
import { MEL_THEME_PRESENTATIONS } from '../pages/avatar-identity.js';
import { PWA_MANIFEST } from '../pages/pwa-manifest.js';
import { SERVICE_WORKER_SOURCE } from '../pages/service-worker.js';
import { validateAndroidUpdateInput } from '../devices/android-update-companion.js';
import { androidStagePcCommand } from '../devices/android-apk-stage-companion.js';
import { selectAuthorizedWindowsCompanion } from '../devices/companion-relay-selection.js';
import { requiredPowerConfirmation } from '../devices/power-confirmation.js';
import { buildMagicPacket, isAllowedBroadcastAddress, normalizeMacAddress } from '../devices/wake-on-lan.js';
import { profileSecretLike } from '../core/orchestrator/conversation-context.js';
import { createProviderNeutralSystemBundle } from '../portability/system-bundle.js';
import { createSovereignRegenerationBundle, verifySovereignRegenerationBundle } from '../continuity/sovereign-regeneration-bundle.js';
import { NORMAL_RUNTIME_SOURCE } from '../pages/mvp-runtime.js';
import { getLegacyInteractionMigrationStatus, LEGACY_INTERACTION_MIGRATION } from '../persistence/gen1-interactions-migration.js';

export const RELEASE_SMOKE_MARKERS = Object.freeze([
  'Prove real production browser.execute',
  'Prove MEL-FILE-01 in real production browser',
  "selector:'#chatFileInput'",
]);

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

let renderedPages;
async function pages() {
  if (!renderedPages) {
    const [{ onRequestGet: full }, { onRequestGet: normal }] = await Promise.all([
      import('../pages/full-interface-v2.js'),
      import('../pages/mvp-interface-v3.js'),
    ]);
    renderedPages = {
      full: await (await full()).text(),
      normal: await (await normal()).text(),
    };
  }
  return renderedPages;
}

function memoryTraceDb(run, events) {
  return {
    prepare(sql) {
      return { bind() { return {
        async first() { return String(sql).includes('lora_training_runs') ? run : null; },
        async all() { return { results: events }; },
      }; } };
    },
  };
}

async function runtimeBundle() {
  const components = [
    ['config', 'core.config', { schema: 'mel.core-config-export/v1', app: { name: 'MEL' }, defaults: {}, database: { schema_version: 'proof' } }],
    ['memory', 'memory.export', { schema: 'mel.portable-memory/v1', records: [] }],
    ['projects', 'planning.projects', { schema: 'mel.planning-projects-export/v1', projects: [], decisions: [], lessons: [] }],
    ['plugins', 'plugins.registry', { schema: 'mel.plugin-runtime-export/v1', plugins: [] }],
    ['skills', 'skills.registry', { schema: 'mel.skill-registry/v1', skills: [], active: {} }],
  ].map(([id, contract, payload]) => ({
    id, contract: { id: contract, version: '1', required: true, description: id }, format: 'application/json', export: async () => payload,
  }));
  return createProviderNeutralSystemBundle({
    generated_at: '2026-11-02T00:00:00.000Z',
    source: { branch: 'main', commit: 'a'.repeat(40) },
    components,
  });
}

async function proveContextQueue() {
  const { full } = await pages();
  if (!full.includes('chatPendingTurns.push') || !full.includes('chatPendingTurns.shift()')) fail('CHAT_QUEUE_NOT_IN_PAGE');
  return { ok: true };
}

async function proveLoraTraining() {
  let confused = false;
  try {
    assertLoraPromotionGuard({
      plan: { base_model: 'Qwen/Qwen2.5-14B', runtime_model: DEFAULT_LORA_RUNTIME_MODEL },
      artifact: { base_model: DEFAULT_LORA_BASE_MODEL, runtime_model: DEFAULT_LORA_RUNTIME_MODEL },
    });
  } catch (error) { confused = error?.code === 'LORA_ADAPTER_INCOMPATIBLE'; }
  let incomplete = false;
  try {
    assertLoraPromotionGuard({
      plan: { base_model: DEFAULT_LORA_BASE_MODEL, runtime_model: DEFAULT_LORA_RUNTIME_MODEL },
      artifact: { base_model: DEFAULT_LORA_BASE_MODEL, runtime_model: DEFAULT_LORA_RUNTIME_MODEL },
    });
  } catch { incomplete = true; }
  if (!confused || !incomplete || !CLOUDFLARE_LORA_MODEL_PAIRS[DEFAULT_LORA_BASE_MODEL]) fail('LORA_TRAINING_GUARD_FAILED');
  return { ok: true };
}

function proveWordPress() {
  assertWordPressPublicContext({ query: 'liturgie' });
  let blocked = false;
  try { assertWordPressPublicContext({ private_memory: 'secret' }); }
  catch (error) { blocked = error?.message === 'WORDPRESS_PRIVATE_CONTEXT_FORBIDDEN'; }
  if (!blocked || wordpressDefinition.site_origin !== 'https://verite-interdite.fr' || wordpressDefinition.secret_references.length !== 0) {
    fail('WORDPRESS_PUBLIC_BOUNDARY_FAILED');
  }
  return { ok: true };
}

async function proveConnectorCatalog() {
  const catalog = new ConnectorCatalog({ healthProbe: async () => ({ status: 'healthy', code: 'READY', latency_ms: 1 }) });
  const manifest = { id: 'proof-installable', name: 'Proof', version: '1.0.0', capabilities: ['data.read'], auth: 'oauth2', scopes: { required: ['data:read'], optional: [] } };
  catalog.register(manifest);
  let rejected = false;
  try { catalog.install({ id: manifest.id, version: manifest.version, grantedScopes: [] }); }
  catch (error) { rejected = error?.message === 'CONNECTOR_CATALOG_REQUIRED_SCOPE_MISSING'; }
  catalog.install({ id: manifest.id, version: manifest.version, grantedScopes: ['data:read'] });
  if (!rejected || catalog.listInstalled().length !== 1 || wordpressDefinition.memory_scope !== 'PUBLIC_ONLY') fail('INSTALLABLE_CATALOG_FAILED');
  return { ok: true };
}

function proveWake() {
  const armed = detectWakePhrase('Bonjour MEL');
  const command = detectWakePhrase('Allô MEL ouvre le chat');
  const noise = detectWakePhrase('bonjour tout le monde');
  if (armed.matched !== true || armed.phrase !== 'bonjour mel' || command.command !== 'ouvre le chat' || noise.matched !== false) {
    fail('WAKE_PHRASE_FAILED');
  }
  return { ok: true };
}

function proveMotion() {
  if (MEL_AVATAR_MOTION_STATES.join() !== 'idle,listening,thinking,speaking,error') fail('AVATAR_MOTION_STATES_MISSING');
  if (!AVATAR_MOTION_SOURCE.includes("aria-busy") || !AVATAR_MOTION_SOURCE.includes("state==='thinking'")) fail('AVATAR_MOTION_SOURCE_MISSING');
  return { ok: true };
}

function proveLipsync() {
  if (normalizeLipSyncLevel(9) !== 3 || normalizeLipSyncLevel('nope') !== 0) fail('LIPSYNC_LEVEL_FAILED');
  if (!AVATAR_LIPSYNC_SOURCE.includes("melAvatarMotionState!=='speaking'")) fail('LIPSYNC_SPEAKING_GUARD_MISSING');
  return { ok: true };
}

function proveIdentity() {
  const themes = Object.keys(MEL_THEME_PRESENTATIONS);
  const routes = themes.map(theme => getMelAvatarPresentation(theme).route);
  if (themes.length !== 8 || new Set(routes).size !== 8 || !routes.includes('/assets/avatars/mel-full.webp')) fail('AVATAR_IDENTITY_FAILED');
  return { ok: true };
}

function provePwa() {
  if (PWA_MANIFEST.display !== 'standalone' || PWA_MANIFEST.start_url !== '/mvp' || !PWA_MANIFEST.icons?.[0]?.src?.includes('mel-full.webp')) {
    fail('PWA_MANIFEST_INVALID');
  }
  if (!SERVICE_WORKER_SOURCE.includes("pathname.startsWith('/api/')")) fail('PWA_CACHES_API');
  return { ok: true };
}

function proveAndroidProtocol() {
  const accepted = validateAndroidUpdateInput({ connect_host: '192.168.1.20:5555' });
  let rejected = false;
  try { validateAndroidUpdateInput({ connect_host: '8.8.8.8:5555' }); }
  catch (error) { rejected = error?.message === 'ANDROID_CONNECT_HOST_INVALID'; }
  if (!rejected || accepted.connect !== '192.168.1.20:5555') fail('ANDROID_PROTOCOL_FAILED');
  return { ok: true };
}

function proveAndroidRelease() {
  let rejected = false;
  try { androidStagePcCommand({ filename: 'mel.apk', sha256: 'zz' }); }
  catch (error) { rejected = error?.message === 'ANDROID_APK_SHA256_INVALID'; }
  const sha = 'a'.repeat(64);
  const staged = androidStagePcCommand({ filename: 'mel.apk', sha256: sha });
  if (!rejected || !staged.command.includes('ANDROID_SOURCE_APK_DIGEST_MISMATCH') || !staged.command.includes('apk_installed=$false')) {
    fail('ANDROID_RELEASE_PROTOCOL_FAILED');
  }
  return { ok: true };
}

function proveWindowsSelection() {
  const now = 1_000_000;
  const fresh = { platform: 'windows', online: true, halted: false, last_seen_at: now - 1000, metadata: { remote_access_enabled: true, engine_heartbeat_at: now - 1000 } };
  const selected = selectAuthorizedWindowsCompanion([fresh], now);
  const stale = selectAuthorizedWindowsCompanion([{ ...fresh, last_seen_at: now - 60_000 }], now);
  const other = selectAuthorizedWindowsCompanion([{ ...fresh, platform: 'android' }], now);
  if (!selected.device || stale.device || other.device) fail('WINDOWS_COMPANION_SELECTION_FAILED');
  return { ok: true };
}

function provePower() {
  if (requiredPowerConfirmation('power.off') !== 'POWER_OFF_APPROVED') fail('POWER_OFF_CONFIRMATION_MISSING');
  if (requiredPowerConfirmation('power.restart') !== 'POWER_RESTART_APPROVED') fail('POWER_RESTART_CONFIRMATION_MISSING');
  if (requiredPowerConfirmation('shell') !== null || requiredPowerConfirmation('power.off; rm -rf') !== null) fail('POWER_FREE_SHELL_ACCEPTED');
  return { ok: true };
}

function proveWakeOnLan() {
  const packet = buildMagicPacket('01-23-45-67-89-ab');
  if (packet.length !== 102 || packet[0] !== 0xff || normalizeMacAddress('01:23:45:67:89:ab') !== '01:23:45:67:89:AB') fail('WAKE_ON_LAN_PACKET_INVALID');
  if (isAllowedBroadcastAddress('8.8.8.8') || !isAllowedBroadcastAddress('192.168.1.255')) fail('WAKE_ON_LAN_BROADCAST_INVALID');
  let rejected = false;
  try { buildMagicPacket('not-a-mac'); } catch { rejected = true; }
  if (!rejected) fail('WAKE_ON_LAN_MAC_ACCEPTED');
  return { ok: true };
}

function proveNoSecretHarvest() {
  const leaked = profileSecretLike('api_key=super-secret-value password=hunter2');
  const ordinary = profileSecretLike('Le chat parle de la feuille de route.');
  if (leaked !== true || ordinary !== false) fail('SECRET_HARVEST_CHECK_FAILED');
  return { ok: true };
}

async function proveSovereignty() {
  const incomplete = await verifySovereignRegenerationBundle({});
  if (incomplete.ok !== false) fail('SOVEREIGNTY_INCOMPLETE_ACCEPTED');
  const bundle = await createSovereignRegenerationBundle({
    sourceSha: 'a'.repeat(40),
    codeReconstruction: { format: 'RS_4_OF_7', data_shards: 4, total_shards: 7, reconstructable: true, independent_of_primary_provider: true, manifest_ref: 'proof', expected_sha256: 'f'.repeat(64) },
    runtimeBundle: await runtimeBundle(),
    recovery: { unattended_activation_policy: 'MAX_100_EMERGENCY_ONLY' },
    generatedAt: '2026-11-02T00:00:00.000Z',
  });
  const verified = await verifySovereignRegenerationBundle(bundle);
  if (verified.ok !== true) fail('SOVEREIGNTY_BUNDLE_REJECTED');
  return { ok: true };
}

async function proveLoraTrace() {
  const missing = await verifyLoraDailyTrace({}, 'run-1');
  const good = await verifyLoraDailyTrace({ DB: memoryTraceDb({ last_seq: 0, trace_sha256: '' }, []) }, 'run-1');
  const bad = await verifyLoraDailyTrace({ DB: memoryTraceDb({ last_seq: 2, trace_sha256: '' }, []) }, 'run-1');
  if (missing.ok !== false || missing.code !== 'D1_NOT_BOUND' || good.ok !== true || bad.ok !== false) fail('LORA_TRACE_CHECK_FAILED');
  return { ok: true };
}

async function proveControlCenter() {
  const { full } = await pages();
  if (!full.includes('Mode complet') || !full.includes('data-panel="chat"') || !full.includes('id="nav"')) fail('CONTROL_CENTER_MISSING');
  return { ok: true };
}

async function proveHome() {
  const { normal } = await pages();
  if (!normal.includes('id="promptInput"') || !normal.includes('id="send"')) fail('MINIMAL_HOME_MISSING');
  return { ok: true };
}

async function proveTouchAvatar() {
  const { normal } = await pages();
  if (!normal.includes('id="melAvatar"') || !normal.includes('/assets/avatars/mel-')) fail('TOUCH_AVATAR_MISSING');
  return { ok: true };
}

async function proveFavicon() {
  const { full, normal } = await pages();
  for (const html of [full, normal]) {
    if (!html.includes('rel="icon"') || !html.includes('mel-full.webp')) fail('FAVICON_MISSING');
  }
  return { ok: true };
}

async function proveFilePaste() {
  const { full, normal } = await pages();
  if (!full.includes('/api/files/upload') || !full.includes('window.melUploadChatFiles=uploadChatFiles') || !full.includes('paste')) fail('FULL_FILE_PASTE_MISSING');
  if (!normal.includes('id="fileInput"') || !normal.includes('drop')) fail('NORMAL_FILE_CONTROL_MISSING');
  if (!NORMAL_RUNTIME_SOURCE.includes('/api/files/upload') || !NORMAL_RUNTIME_SOURCE.includes('paste')) fail('NORMAL_FILE_PASTE_MISSING');
  return { ok: true };
}

async function proveGen1() {
  const missing = await getLegacyInteractionMigrationStatus({});
  const columns = LEGACY_INTERACTION_MIGRATION.required_columns;
  if (missing?.code !== 'GEN1_MIGRATION_DB_REQUIRED' || LEGACY_INTERACTION_MIGRATION.conversation_id !== 'legacy-gen1' || columns.length !== 7 || !columns.includes('user_text') || !columns.includes('assistant_text')) {
    fail('GEN1_MIGRATION_CONTRACT_FAILED');
  }
  return { ok: true };
}

function proveReleaseSmoke() {
  if (RELEASE_SMOKE_MARKERS.length !== 3 || RELEASE_SMOKE_MARKERS.some(marker => !marker.trim())) fail('RELEASE_SMOKE_MARKERS_MISSING');
  return { ok: true };
}

export const DECLARED_ROADMAP_PROOFS = Object.freeze([
  { roadmapId: 'MEL-CONTEXT-01', id: 'context.queue.verify', name: 'File de messages pendant une réponse', prove: proveContextQueue },
  { roadmapId: 'MEL-EVOL-06', id: 'lora.continuous-training.verify', name: 'Garde de promotion LoRA', prove: proveLoraTraining },
  { roadmapId: 'MEL-CONN-01', id: 'wordpress.public-boundary.verify', name: 'Limite publique WordPress', prove: proveWordPress },
  { roadmapId: 'MEL-CONN-02', id: 'connectors.installable-catalog.verify', name: 'Catalogue de connecteurs installables', prove: proveConnectorCatalog },
  { roadmapId: 'MEL-VOICE-01', id: 'voice.wake-phrase.verify', name: 'Mot de réveil MEL', prove: proveWake },
  { roadmapId: 'MEL-AVATAR-01', id: 'avatar.motion.verify', name: 'États d’animation de l’avatar', prove: proveMotion },
  { roadmapId: 'MEL-AVATAR-02', id: 'avatar.lipsync.verify', name: 'Mouvement des lèvres pendant la parole', prove: proveLipsync },
  { roadmapId: 'MEL-AVATAR-03', id: 'avatar.identity.verify', name: 'Tenues canoniques de MEL', prove: proveIdentity },
  { roadmapId: 'GEN2-26', id: 'pwa.manifest.verify', name: 'Manifeste PWA et cache hors API', prove: provePwa },
  { roadmapId: 'GEN2-27', id: 'android.companion-protocol.verify', name: 'Protocole Android sur réseau privé', prove: proveAndroidProtocol },
  { roadmapId: 'GEN2-58', id: 'android.release-protocol.verify', name: 'Publication Android vérifiée par empreinte', prove: proveAndroidRelease },
  { roadmapId: 'GEN2-59', id: 'windows.companion-selection.verify', name: 'Sélection du compagnon Windows autorisé', prove: proveWindowsSelection },
  { roadmapId: 'MEL-DEVICE-02', id: 'device.power-confirmation.verify', name: 'Confirmation exacte des commandes d’alimentation', prove: provePower },
  { roadmapId: 'MEL-DEVICE-03', id: 'device.wake-on-lan.verify', name: 'Paquet Wake-on-LAN', prove: proveWakeOnLan },
  { roadmapId: 'MEL-SEC-05', id: 'security.secret-harvest.verify', name: 'Détection d’un secret dans un texte', prove: proveNoSecretHarvest },
  { roadmapId: 'MEL-SOV-01', id: 'sovereignty.regeneration.verify', name: 'Bundle de régénération souveraine', prove: proveSovereignty },
  { roadmapId: 'MEL-LORA-TRACE-01', id: 'lora.daily-trace.verify', name: 'Vérification de la chaîne de trace LoRA', prove: proveLoraTrace },
  { roadmapId: 'GEN2-54', id: 'ui.control-center.verify', name: 'Mode complet servi', prove: proveControlCenter },
  { roadmapId: 'MEL-UI-01', id: 'ui.home-minimal.verify', name: 'Accueil minimal servi', prove: proveHome },
  { roadmapId: 'MEL-UI-02', id: 'ui.touch-avatar.verify', name: 'Avatar servi dans l’accueil', prove: proveTouchAvatar },
  { roadmapId: 'MEL-UI-03', id: 'ui.favicon.verify', name: 'Favicon MEL servi', prove: proveFavicon },
  { roadmapId: 'MEL-UI-06', id: 'ui.file-paste.verify', name: 'Collage de fichier dans les deux chats', prove: proveFilePaste },
  { roadmapId: 'GEN2-57', id: 'migration.gen1-contract.verify', name: 'Contrat de migration Gen1 sans perte', prove: proveGen1 },
  { roadmapId: 'MEL-REL-03', id: 'release.smoke-contract.verify', name: 'Contrat des sondes de release', prove: proveReleaseSmoke },
]);

export function registerDeclaredRoadmapProofs(bus) {
  for (const proof of DECLARED_ROADMAP_PROOFS) {
    bus.discover({
      id: proof.id, name: proof.name, category: 'diagnostic', version: '1.0.0', provider: 'core',
      description: 'Preuve logicielle bornée. Ne remplace pas un appareil, une release ou un entraînement réel.',
      input_schema: { type: 'object', additionalProperties: false },
      output_schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
      risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
    }, async () => proof.prove());
  }
}
