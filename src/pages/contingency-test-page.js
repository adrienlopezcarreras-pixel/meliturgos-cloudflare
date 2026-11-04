import { allScenarios } from '../continuity/contingency-plan.js';
import { REPLACEMENT_CATALOG } from '../continuity/replacement-catalog.js';
import { allLifeEvents, CORE_BRICKS, planCoreMigration } from '../continuity/life-contingency.js';

const PARTS = Object.freeze(['cloudflare', 'pc', 'github', 'model', 'gmail', 'onedrive', 'shards']);

export function contingencyTestModel() {
  const migrations = {};
  for (const part of Object.keys(CORE_BRICKS)) {
    migrations[part] = {
      blocked: planCoreMigration({ part, replacementReady: false }),
      ready: planCoreMigration({ part, replacementReady: true }),
    };
  }
  return {
    schema: 'mel.contingency-test-page/v1',
    disconnects_production: false,
    parts: PARTS,
    scenarios: allScenarios(),
    life: allLifeEvents(),
    migrations,
    replacement_catalog: REPLACEMENT_CATALOG,
  };
}

export function renderContingencyTestPage() {
  const model = contingencyTestModel();
  const data = JSON.stringify(model).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test de contingence MEL</title>
<style>
  :root{color-scheme:dark;--bg:#0e1420;--panel:#192338;--edge:#31435c;--text:#eef3fd;--muted:#b9c9e0;--accent:#98caff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:16px/1.52 system-ui,-apple-system,Segoe UI,sans-serif}
  main{max-width:1120px;margin:0 auto;padding:18px 18px 60px}
  .topbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:25px}
  a{color:var(--accent)}
  .back{display:inline-flex;align-items:center;min-height:44px;padding:9px 17px;border:1px solid #6285ad;border-radius:10px;color:#fff;background:#2b4564;font-weight:750;text-decoration:none}
  .back:hover,.back:focus-visible{background:#365a82;outline:2px solid #a3cfff;outline-offset:2px}
  .pr-link{display:inline-flex;align-items:center;padding:8px 0;font-size:.93rem}
  h1{font-size:clamp(1.6rem,4vw,2.3rem);line-height:1.16;margin:0 0 10px}
  h2{font-size:1.15rem;margin:0 0 10px}
  h3{font-size:1rem;margin:0 0 8px}
  p{margin:7px 0 12px}
  .lede{max-width:800px;color:var(--muted)}
  .eyebrow{color:#9ecaf2;font-size:.76rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
  .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:22px 0}
  .metric{background:#1b293d;border:1px solid var(--edge);border-radius:12px;padding:13px 16px}
  .metric strong{display:block;font-size:1.65rem;font-variant-numeric:tabular-nums}
  .metric span{color:var(--muted);font-size:.88rem}
  .warn{border:1px solid #967a42;background:#352915;border-radius:11px;padding:14px 16px;margin-bottom:22px}
  .warn strong{display:block;margin-bottom:4px}
  .panels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:15px}
  .panel{background:var(--panel);border:1px solid var(--edge);border-radius:14px;padding:20px;margin-top:16px;min-width:0}
  .panel:nth-child(-n+2){margin-top:0}
  .wide{grid-column:1/-1}
  .section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .subtle{color:var(--muted);font-size:.9rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:9px;margin:16px 0}
  .part{display:flex;gap:10px;align-items:center;background:#243149;border:1px solid #425470;border-radius:9px;padding:12px;min-height:52px;cursor:pointer}
  .part:has(input:checked){border-color:#81b9fa;background:#25446a}
  input[type=checkbox]{width:19px;height:19px;accent-color:#7db6ed;flex:none}
  .control{display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--muted)}
  select,button{font:inherit}
  select{display:block;width:100%;max-width:100%;padding:12px;background:#243149;color:var(--text);border:1px solid #6a819d;border-radius:9px}
  button{min-height:42px;border:1px solid #7c9ec1;background:#2a425e;color:var(--text);border-radius:8px;padding:8px 12px;cursor:pointer}
  button:hover{background:#385b80}
  button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #a3d2ff;outline-offset:2px}
  .output{margin-top:13px;padding:12px 14px;border:1px solid #3d536e;background:#122035;border-radius:9px}
  .output p{margin:5px 0}
  .decision{border-left:4px solid #7db6ed}
  .list{display:grid;gap:9px}
  .candidate{background:#122035;border:1px solid #3b4c65;border-radius:10px;padding:12px 14px}
  .candidate h3{margin:0 0 5px}
  .candidate p{overflow-wrap:anywhere;font-size:.92rem;color:var(--muted)}
  .gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:11px}
  .gate{background:#132035;border:1px solid #3e526c;border-radius:9px;padding:12px}
  .gate b{display:block;margin-bottom:5px}
  .gate span{font-size:.88rem;color:var(--muted)}
  footer{margin-top:30px;padding-top:19px;border-top:1px solid var(--edge);color:var(--muted);font-size:.92rem}
  footer .back{margin-top:12px;color:#fff}
  @media(max-width:740px){.panels{display:block}.panel,.panel:nth-child(-n+2){margin-top:14px}.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.metric{padding:10px}.metric strong{font-size:1.35rem}.metric span{font-size:.78rem}main{padding:14px 12px 35px}}
  @media(max-width:420px){.metrics{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.topbar{align-items:stretch}.back{justify-content:center}}
</style>
</head>
<body>
<main>
  <nav class="topbar" aria-label="Navigation">
    <a class="back" href="/professor" role="button">← Retour au mode complet de MEL</a>
    <a class="pr-link" href="https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/pull/3094" target="_blank" rel="noopener noreferrer">Voir la PR d'intégration et les contrôles GitHub</a>
  </nav>
  <div class="eyebrow">Plan Contingence / Laboratoire sans effet réel</div>
  <h1>Tester ce qui se passe si un service tombe</h1>
  <p class="lede">Sélectionne les composants en panne. La page explique le scénario, les contre-mesures prévues, les pistes de remplacement et les validations manquantes. Elle ne montre pas l'état de santé réel de MEL.</p>
  <div class="metrics" aria-label="Couverture du plan">
    <div class="metric"><strong id="count-parts">–</strong><span>composants simulables</span></div>
    <div class="metric"><strong id="count-scenarios">–</strong><span>scénarios codés</span></div>
    <div class="metric"><strong id="count-events">–</strong><span>événements de défaillance</span></div>
  </div>
  <aside class="warn" role="note"><strong>Simulation uniquement — aucune action en production.</strong>Les cases sont fictives, les candidats sont non certifiés : aucun remplaçant n'est activé, aucune restauration n'est lancée et aucun déploiement n'est effectué. Les réussites de tests ne remplacent pas les preuves de reprise réelle.</aside>
  <div class="panels">
    <section class="panel" aria-labelledby="choice-title">
      <div class="section-head"><h2 id="choice-title">1. Quels composants sont en panne ?</h2><button id="reset" type="button">Tout réinitialiser</button></div>
      <p class="subtle">Coche une ou plusieurs cases pour simuler une panne. Le PC est un secours optionnel ; sa déconnexion normale n'est pas une panne constatée.</p>
      <div class="grid" id="parts"></div>
      <label class="control"><input id="ready" type="checkbox"> Simuler un candidat techniquement prêt (sans preuve ni autorisation de bascule)</label>
      <h3>Défaillance particulière</h3>
      <select id="life" aria-label="Événement à simuler"></select>
    </section>
    <section class="panel" aria-labelledby="result-title">
      <h2 id="result-title">2. Résultat du scénario</h2>
      <p class="subtle" id="selection-summary">Aucun composant sélectionné.</p>
      <div class="output decision" role="status" aria-live="polite">
        <h3>Conséquence et décision prévue</h3>
        <p id="outage"></p>
      </div>
      <div class="output"><h3>Migration éventuelle</h3><p id="migration"></p></div>
      <div class="output"><h3>Événement particulier</h3><p id="event"></p></div>
    </section>
    <section class="panel wide" aria-labelledby="replacement-title">
      <h2 id="replacement-title">3. Remplaçants et preuves nécessaires</h2>
      <p class="subtle" id="candidates">Aucune panne simulée : aucun remplaçant requis.</p>
      <div id="replacement-details" class="list"></div>
      <p class="subtle">Ces fournisseurs sont des pistes de recherche, pas des services disponibles ou certifiés. Chaque remplacement nécessite des essais indépendants et une approbation explicite.</p>
    </section>
    <section class="panel wide" aria-labelledby="proof-title">
      <h2 id="proof-title">4. Ce qui reste à prouver en exploitation</h2>
      <p class="subtle">La couverture de code ci-dessus n'est pas une certification opérationnelle. Cette page n'accède ni à la base D1, ni aux secrets R2, ni aux décisions du Council.</p>
      <div class="gates">
        <div class="gate"><b>Restaurer D1/R2</b><span>Exiger un exercice réel de restauration isolée et une preuve d'intégrité.</span></div>
        <div class="gate"><b>Revue Council</b><span>Exiger les votes indépendants sur le SHA complet, sans diff tronqué.</span></div>
        <div class="gate"><b>ShardVault 7/7</b><span>Exiger les fragments réels, leurs empreintes et un exercice de reconstruction.</span></div>
        <div class="gate"><b>Relais et remplacement</b><span>Exiger des sondes signées, le test du relais et l'approbation du propriétaire avant activation.</span></div>
      </div>
      <p class="subtle">État réel à vérifier sur <a href="https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/pull/3094" target="_blank" rel="noopener noreferrer">la PR #3094 et ses contrôles</a> ; ce tableau ne prétend pas qu'ils sont réussis ou encore en cours.</p>
    </section>
  </div>
  <footer>Notice : cette page est un test. Elle ne coupe pas Cloudflare, GitHub, le modèle, ni aucune autre brique. Rien n'est migré depuis ici.
    <div><a class="back" href="/professor" role="button">← Retour au mode complet de MEL</a></div>
  </footer>
</main>
<script id="model" type="application/json">${data}</script>
<script>
const model = JSON.parse(document.getElementById('model').textContent);
const NAMES = {
  cloudflare: 'Cloudflare (application)',
  pc: 'PC (secours optionnel)',
  github: 'GitHub (dépôt et Actions)',
  model: 'Modèle IA',
  gmail: 'Gmail (copie privée)',
  onedrive: 'OneDrive (copie privée)',
  shards: 'ShardVault (fragments publics)',
};
const NICE = {
  KEEP_MAX_ON_CLOUDFLARE: 'Maintenir le service sur Cloudflare',
  DO_NOT_EXPECT_LOCAL_STANDBY: 'Ne pas supposer que le PC est disponible',
  DO_NOT_DEPLOY: 'Ne pas déployer',
  USE_OTHER_PROVEN_MODEL: 'N’envisager qu’un modèle de secours prouvé',
  KEEP_REMAINING_PRIVATE_KIT: 'Préserver la copie privée restante',
  DO_NOT_USE_PUBLIC_SHARDS_AS_KEY: 'Ne jamais utiliser les shards publics comme clé',
  MOVE_MAX_TO_PC: 'Préparer un relais PC seulement s’il est opérationnel',
  RUN_CODE_ON_GITHUB_ACTIONS: 'Préparer un relais GitHub Actions, après preuve',
  SITE_AND_MEMORY_STAY_DOWN: 'Le site et la mémoire Cloudflare restent indisponibles',
  STOP_AND_REBUILD_FROM_PRIVATE_KIT: 'Suspendre et préparer la reconstruction privée',
  STOP_MEMORY_KEY_UNAVAILABLE: 'Bloquer la reprise : clé privée inaccessible',
  PUBLIC_MAP_ONLY: 'Les shards publics ne contiennent qu’une carte',
};
document.getElementById('count-parts').textContent = String(model.parts.length);
document.getElementById('count-scenarios').textContent = String(model.scenarios.length);
document.getElementById('count-events').textContent = String(model.life.length);
const parts = document.getElementById('parts');
for (const part of model.parts) {
  const label = document.createElement('label');
  label.className = 'part';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.part = part;
  label.append(input, document.createTextNode(NAMES[part] || part));
  parts.appendChild(label);
}
const life = document.getElementById('life');
const none = document.createElement('option');
none.value = '';
none.textContent = 'Aucune défaillance particulière';
life.appendChild(none);
for (const row of model.life) {
  const option = document.createElement('option');
  option.value = row.id;
  option.textContent = row.id + ' — ' + row.implication;
  life.appendChild(option);
}
function selected() {
  return [...document.querySelectorAll('[data-part]:checked')].map(node => node.dataset.part);
}
function render() {
  const down = selected();
  // Compare sets rather than array order: 127 different combinations must be selectable.
  const scenario = model.scenarios.find(row =>
    row.down.length === down.length && row.down.every(part => down.includes(part)));
  document.getElementById('selection-summary').textContent = down.length
    ? down.length + ' / ' + model.parts.length + ' composants simulés en panne : ' + down.map(p => NAMES[p] || p).join(', ')
    : 'Aucun composant simulé en panne.';
  document.getElementById('outage').textContent = scenario
    ? scenario.consequence + ' Contre-mesures prévues : ' + scenario.countermeasure.map(code => NICE[code] || code).join(' ; ') + '.'
    : 'Aucune panne simulée. Aucun changement de service.';
  const ready = document.getElementById('ready').checked;
  const cores = down.filter(part => model.migrations[part]);
  document.getElementById('migration').textContent = cores.length
    ? cores.map(part => {
        const plan = model.migrations[part][ready ? 'ready' : 'blocked'];
        const steps = Array.isArray(plan.steps) && plan.steps.length ? ' Étapes envisagées : ' + plan.steps.join(' → ') + '.' : '';
        return (NAMES[part] || part) + ' : ' + plan.status + '.' + steps + ' Aucune activation exécutée.';
      }).join(' ')
    : 'Pas de migration centrale envisagée.';
  const event = model.life.find(row => row.id === life.value);
  document.getElementById('event').textContent = event
    ? event.id + ' : ' + event.implication + ' — contre-mesure : ' + event.countermeasure + '.'
    : 'Aucune défaillance particulière simulée.';
  const list = document.getElementById('replacement-details');
  list.replaceChildren();
  for (const part of down) {
    const entry = model.replacement_catalog[part];
    if (!entry) continue;
    const item = document.createElement('div');
    item.className = 'candidate';
    const name = document.createElement('h3');
    name.textContent = NAMES[part] || part;
    const candidates = document.createElement('p');
    candidates.textContent = 'Pistes : ' + entry.candidates.join(' · ');
    const evidence = document.createElement('p');
    evidence.textContent = 'Preuves requises : ' + entry.probes.join(' · ') + '. Statut : non certifié, aucune activation.';
    item.append(name, candidates, evidence);
    list.appendChild(item);
  }
  document.getElementById('candidates').textContent = down.length
    ? down.length + ' composant(s) : candidats, ni activés ni validés ; preuve indépendante et accord requis.'
    : 'Aucune panne simulée : aucun remplaçant requis.';
}
parts.addEventListener('change', render);
document.getElementById('ready').addEventListener('change', render);
life.addEventListener('change', render);
document.getElementById('reset').addEventListener('click', () => {
  for (const input of parts.querySelectorAll('input[type=checkbox]')) input.checked = false;
  document.getElementById('ready').checked = false;
  life.value = '';
  render();
});
render();
</script>
</body>
</html>`;
}
