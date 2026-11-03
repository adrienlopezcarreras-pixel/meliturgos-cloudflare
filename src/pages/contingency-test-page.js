import { allScenarios } from '../continuity/contingency-plan.js';
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
  body{margin:0;background:#10141c;color:#e7ecf5;font:16px/1.45 system-ui,sans-serif}
  main{max-width:880px;margin:0 auto;padding:28px 18px 48px}
  h1{font-size:1.4rem;margin:0 0 8px}
  .warn{background:#3a2a12;border:1px solid #8a6a32;border-radius:10px;padding:12px 14px;margin:14px 0 22px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
  label{display:flex;gap:8px;align-items:center;background:#1b2230;border-radius:8px;padding:8px 10px}
  select,button{font:inherit}
  select{margin-top:8px;background:#1b2230;color:inherit;border:1px solid #314056;border-radius:8px;padding:8px}
  article{margin-top:18px;background:#182033;border-radius:12px;padding:14px 16px}
  h2{font-size:1rem;margin:0 0 8px}
  code{color:#9fd0ff}
  footer{margin-top:28px;padding-top:14px;border-top:1px solid #314056;color:#b7c3d6;font-size:.92rem}
  a.back{display:inline-block;margin:0 0 16px;padding:8px 12px;border-radius:8px;background:#243044;color:#e7ecf5;text-decoration:none}
</style>
</head>
<body>
<main>
  <a class="back" href="/professor">Retour au mode complet</a>
  <h1>Que fait MAX si quelque chose tombe</h1>
  <p class="warn">Cette page ne débranche rien. Elle montre la décision. Le cycle de MAX l'exécute seulement quand le fait est vrai.</p>
  <h2>Coche une brique tombée</h2>
  <div class="grid" id="parts"></div>
  <label style="margin-top:12px"><input id="ready" type="checkbox"> Un remplaçant de Cloudflare, GitHub ou du modèle est déjà prouvé</label>
  <h2 style="margin-top:22px">Choisis un échec</h2>
  <select id="life"></select>
  <article>
    <h2>Si ces briques tombent</h2>
    <p id="outage"></p>
    <h2>Si une brique centrale doit changer</h2>
    <p id="migration"></p>
    <h2>Si cet échec arrive</h2>
    <p id="event"></p>
  </article>
  <footer>Notice : cette page est un test. Elle ne coupe pas Cloudflare, GitHub, le modèle, ni aucune autre brique. Rien n'est migré depuis ici.</footer>
</main>
<script id="model" type="application/json">${data}</script>
<script>
const model = JSON.parse(document.getElementById('model').textContent);
const NAMES = {
  cloudflare: 'Cloudflare, le site',
  pc: 'Le PC',
  github: 'GitHub, le code',
  model: 'Le modèle',
  gmail: 'Gmail, la copie',
  onedrive: 'OneDrive, la copie',
  shards: 'Les shards publics',
};
const parts = document.getElementById('parts');
for (const part of model.parts) {
  const label = document.createElement('label');
  label.innerHTML = '<input type="checkbox" data-part="'+part+'"> '+(NAMES[part] || part);
  parts.appendChild(label);
}
const life = document.getElementById('life');
const none = document.createElement('option');
none.value = '';
none.textContent = 'Aucun échec choisi';
life.appendChild(none);
for (const row of model.life) {
  const option = document.createElement('option');
  option.value = row.id;
  option.textContent = row.implication;
  life.appendChild(option);
}
function selected() {
  return [...document.querySelectorAll('[data-part]:checked')].map(node => node.dataset.part).sort();
}
function render() {
  const down = selected();
  const scenario = model.scenarios.find(row => row.down.join(',') === down.join(','));
  document.getElementById('outage').textContent = scenario
    ? scenario.consequence+' Contre-mesure : '+scenario.countermeasure.join(', ')+'.'
    : 'Aucune brique débranchée. MAX reste où elle est.';
  const ready = document.getElementById('ready').checked;
  const cores = down.filter(part => model.migrations[part]);
  document.getElementById('migration').textContent = cores.length
    ? cores.map(part => {
        const plan = model.migrations[part][ready ? 'ready' : 'blocked'];
        return plan.label || part+' ('+plan.layer+') : '+plan.status+(plan.steps.length ? ' → '+plan.steps.join(' → ') : ' → on garde la source')+'. Rien n est exécuté.';
      }).join(' ')
    : 'Pas de brique centrale débranchée. Aucune migration.';
  const event = model.life.find(row => row.id === life.value);
  document.getElementById('event').textContent = event
    ? event.implication+' Contre-mesure : '+event.countermeasure+'.'
    : 'Aucun échec choisi.';
}
parts.addEventListener('change', render);
document.getElementById('ready').addEventListener('change', render);
life.addEventListener('change', render);
render();
</script>
</body>
</html>`;
}
