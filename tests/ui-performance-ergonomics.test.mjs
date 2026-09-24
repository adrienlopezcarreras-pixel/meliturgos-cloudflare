import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderNormal } from '../src/pages/mvp-interface-v3.js';
import { onRequestGet as renderProfessor } from '../src/pages/full-interface-v2.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { SERVICE_WORKER_SOURCE } from '../src/pages/service-worker.js';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Professor hot path has one functional UI owner', async () => {
  const [html,index,learning] = await Promise.all([
    (await renderProfessor()).text(),
    read('src/index.js'),
    read('src/professor-live-learning-entry.js'),
  ]);
  assert.doesNotMatch(index,/mvp-behavior-enhancer|enhanceMvpBehavior/);
  assert.doesNotMatch(learning,/PROFESSOR_LIVE_LEARNING_PATCH|enhanceProfessorLearning/);
  assert.doesNotMatch(html,/mel-full-control-runtime|mel-roadmap-live-refresh-runtime|mel-work-truth-runtime|mel-professor-live-learning-runtime/);
  assert.match(html,/id="melFullCycle"/);
  assert.match(html,/id="melRunBenchmark"/);
  assert.match(html,/id="melPrepareLora"/);
});

test('Professor mobile controls are unambiguous and secondary navigation is collapsed', async () => {
  const html = await (await renderProfessor()).text();
  assert.match(html,/Mettre MEL en pause/);
  assert.match(html,/Veille des capacités/);
  assert.doesNotMatch(html,/<button id="mobilePauseAutonomy">Veille<\/button>/);
  assert.match(html,/id="mobileMoreNav"/);
  assert.match(html,/id="mobileMoreMenu"[^>]*hidden/);
});

test('Professor boot is lightweight and live refresh is visibility-aware', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  const boot = source.match(/async function boot\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(boot,/codeCheck\(/);
  assert.match(boot,/loadDashboardSummary\(\)/);
  assert.doesNotMatch(boot,/loadCapabilitySummary\(\)|loadRoadmapSummary\(\)/);
  assert.match(source,/if\(document\.hidden\)return/);
  assert.match(source,/active==='roadmap'/);
  assert.match(source,/active==='multi'/);
  assert.match(source,/active==='overview'\)loadLearningProgress/);
});

test('normal mode is keyboard accessible, voice-discoverable and runtime is versioned', async () => {
  const html = await (await renderNormal()).text();
  assert.match(html,/id="drop" role="button" tabindex="0" aria-label="Ajouter des fichiers"/);
  assert.match(html,/aria-label="Parler à MEL au micro"/);
  assert.match(html,/class="mic-hint"/);
  assert.match(html,/↩ Reprendre le dernier échange/);
  assert.match(html,/class="window empty-chat"/);
  assert.match(html,/normal-runtime\.js\?v=7/);
  assert.match(NORMAL_RUNTIME_SOURCE,/drop\.addEventListener\('keydown'/);
  assert.match(NORMAL_RUNTIME_SOURCE,/navigator\.serviceWorker\.register\('\/sw\.js'/);
});

test('service worker caches only static resources, persists revalidation and leaves private HTML to the network', () => {
  assert.match(SERVICE_WORKER_SOURCE,/meliturgos-static-v7/);
  assert.match(SERVICE_WORKER_SOURCE,/staleWhileRevalidate/);
  assert.match(SERVICE_WORKER_SOURCE,/event\.waitUntil\(update/);
  assert.match(SERVICE_WORKER_SOURCE,/url\.pathname\.startsWith\('\/assets\/'\)/);
  assert.match(SERVICE_WORKER_SOURCE,/request\.mode==='navigate'.*return/);
  assert.doesNotMatch(SERVICE_WORKER_SOURCE,/cache\.add\('\/'\)|FALLBACK='\/'/);
});

test('normal runtime HTTP route has reusable cache headers', async () => {
  const router = await read('src/router.js');
  assert.match(router,/normal-runtime\.js/);
  assert.match(router,/public, max-age=86400, stale-while-revalidate=604800/);
});

test('Professor IA and Work are rendered as one canonical tabbed surface with real Work loading', async () => {
  const html = await (await renderProfessor()).text();
  assert.match(html,/id="melUnifiedTabs"/);
  assert.match(html,/data-mode-panel="meeting"/);
  assert.match(html,/data-mode-panel="development" hidden/);
  assert.doesNotMatch(html,/data-panel="work"/);
  assert.doesNotMatch(html,/mel-control-center-runtime/);
  assert.match(html,/if\(development\)\{await loadWork\(\)/);
});

test('ShardVault status page is passive until an explicit user action', async () => {
  const response = await handleShardVaultStatus(new Request('https://mel.invalid/shardvault'), {});
  const html = await response.text();
  assert.match(html,/Mode lecture/);
  assert.doesNotMatch(html,/autoRepairStarted|autoCodeSyncStarted|setTimeout\(\(\)=>search\(\),250\)/);
  assert.match(html,/if\(!document\.hidden\)load\(\)/);
  assert.match(html,/role="status" aria-live="polite"/);
});

test('Professor exposes a lightweight dashboard summary route and registers the static cache', async () => {
  const [page,router] = await Promise.all([read('src/pages/full-interface-v2.js'),read('src/router.js')]);
  assert.match(page,/\/api\/gen2\/dashboard-summary/);
  assert.match(router,/path === "\/api\/gen2\/dashboard-summary"/);
  assert.match(router,/const refresh = url\.searchParams\.get\("refresh"\) === "1";/);
  assert.match(router,/const capabilities = refresh \? await runtime\.bus\.refreshHealthAll\(\) : runtime\.bus\.list\(\);/);
  assert.match(page,/navigator\.serviceWorker\.register\('\/sw\.js'/);
});


test('Professor desktop hides the mobile Plus control and keeps a populated mobile secondary menu', async () => {
  const html = await (await renderProfessor()).text();
  assert.ok(html.includes('.nav button.mobile-more-nav,.mobile-more-menu{display:none}'));
  assert.ok(html.includes('.mobile-more-nav{display:flex!important}'));
  assert.match(html, /id="mobileMoreMenu"[^>]*hidden/);
  for (const target of ['skills','roadmap','computer','terminal','lora','diagnostics']) {
    assert.match(html, new RegExp('data-jump="' + target + '"'));
  }
});

test('MEL techno avatar is the canonical favicon in normal and Professor modes', async () => {
  const normal = await (await renderNormal()).text();
  const professor = await (await renderProfessor()).text();
  for (const html of [normal, professor]) {
    assert.ok(html.includes('rel="icon" type="image/webp" sizes="any" href="/assets/avatars/mel-full.webp?v=mel-techno-20260924"'));
    assert.ok(html.includes('rel="apple-touch-icon" href="/assets/avatars/mel-full.webp?v=mel-techno-20260924"'));
    assert.equal(html.includes('mel-full.webp?v=mel-techno-20260924'), true);
  }
});

test('Professor skills surface uses cached health on open and forces a real refresh only on explicit request', async () => {
  const html = await (await renderProfessor()).text();
  assert.match(html, /id="skillsHealthy"/);
  assert.match(html, /id="skillsProtected"/);
  assert.match(html, /id="skillsDegraded"/);
  assert.match(html, /id="skillsUnavailable"/);
  assert.match(html, /id="skillsFailed"/);
  assert.match(html, /id="skillsProviderSummary"/);
  assert.ok(html.includes('loadCapabilitiesData(force)'));
  assert.ok(html.includes("loadSkills(true)"));
  assert.ok(html.includes('health_detail'));
  assert.ok(html.includes('NON CONFIGURÉ'));
});


test('Professor capability health semantics distinguish protected, degraded, non-configured and failed states', async () => {
  const [html, router] = await Promise.all([(await renderProfessor()).text(), read('src/router.js')]);
  assert.match(html, /\.tag\.protected,\.tag\.info/);
  assert.match(html, /\.tag\.neutral/);
  assert.match(html, /raw==='PROTECTED'\?'protected'/);
  assert.match(html, /\['UNAVAILABLE','OFFLINE','DISABLED'\]\.includes\(raw\)\?'neutral'/);
  assert.match(router, /const capabilities = refresh \? await runtime\.bus\.refreshHealthAll\(\) : runtime\.bus\.list\(\);/);
  assert.match(router, /const protectedStates = new Set\(\["PROTECTED"\]\)/);
  assert.doesNotMatch(router, /degradedStates = new Set\(\[[^\]]*"PROTECTED"/);
  assert.match(router, /unavailable > 0 \? "INFO" : "OK"/);
});


test('Professor avoids expensive visual effects and blocking health probes on the hot path', async () => {
  const [html,router] = await Promise.all([(await renderProfessor()).text(), read('src/router.js')]);
  assert.match(html,/background-attachment:scroll!important/);
  assert.match(html,/\.card\{[^}]*backdrop-filter:none!important/);
  assert.doesNotMatch(html,/backdrop-filter:blur\(18px\)/);
  assert.match(router,/url\.searchParams\.get\("refresh"\) === "1"/);
  assert.doesNotMatch(router,/url\.searchParams\.get\("refresh"\) !== "0"/);
  assert.match(html,/Réponse serveur trop lente/);
  assert.match(html,/loadChatGPTImportStatus\(\)\.catch\(\(\)=>\{\}\);loadShardVaultStatus\(\)\.catch\(\(\)=>\{\}\)/);
});
