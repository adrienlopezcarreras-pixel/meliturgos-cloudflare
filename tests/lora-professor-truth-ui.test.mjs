import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Professor LoRA panel keeps only the stages tied to a real run', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  for (const label of ['1. Entraînement', '2. Checkpoint immuable', '3. Validation / benchmark']) {
    assert.ok(source.includes(label), `missing LoRA stage: ${label}`);
  }
  for (const gone of ['4. Promotion', '5. Actif dans MEL', 'Suite AGENTIC', 'Ouvrir la promotion', 'réellement exécuté et terminé']) {
    assert.equal(source.includes(gone), false, `disconnected LoRA control still shown: ${gone}`);
  }

  assert.ok(source.includes('freeValidationState'), 'validation/benchmark state must be explicit');
  assert.ok(source.includes("traceStatus==='SUCCEEDED'&&Number(dailyTrace?.trace_verified)===1"), 'verified successful trace must be a durable proof input');
  assert.ok(source.includes("'CHECKPOINT VÉRIFIÉ'"), 'verified success trace must prevent stale checkpoint pending state');
  assert.ok(source.includes("'NON LANCÉE · OPTIONNELLE'"), 'unstarted optional promotion must not look like a failure');
  assert.ok(source.includes('const applicable=knownStages.filter(x=>x.known)'), 'progress must be computed from known/applicable stages');
});

test('Kaggle training success cannot impersonate a passed canonical benchmark', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  const panel = source.slice(source.indexOf('async function loadFreeLoraStatus(){'), source.indexOf("qs('#freeLoraRefresh').onclick="));
  assert.match(panel, /const benchmarkVerified=impact\?\.canonical_gate_passed===true&&impact\?\.impact_gate_passed===true/);
  assert.match(panel, /const validationDone=benchmarkVerified;/);
  assert.doesNotMatch(panel, /const validationDone=traceSuccess/);
  assert.match(panel, /BENCHMARK NON PROUVÉ/);
  assert.match(panel, /CHECKPOINT VÉRIFIÉ/, 'preserve the independent successful training checkpoint state');
});

test('Professor LoRA panel does not render empty benchmark pseudo-metrics', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  for (const id of [
    'freeImpactTechnical',
    'freeImpactSensitive',
    'freeImpactRefusal',
    'freeImpactBoundary',
    'freeImpactAgentic',
    'freeImpactDelta',
  ]) assert.ok(!source.includes(`id="${id}"`), `empty pseudo-metric should be hidden: ${id}`);
});

test('LoRA trace proof is computed before the checkpoint and benchmark cards use it', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  const panel = source.slice(source.indexOf('async function loadFreeLoraStatus(){'), source.indexOf("qs('#freeLoraRefresh').onclick="));
  const traceDeclaration = panel.indexOf('const traceSuccess=');
  const checkpointCard = panel.indexOf("qs('#freeCheckpointStage').textContent=");
  assert.ok(traceDeclaration >= 0 && checkpointCard > traceDeclaration,
    'traceSuccess must be initialized before any UI branch can use it (avoid TDZ ReferenceError)');
  assert.match(panel, /qs\('#freeLoraBar'\)\.style\.width='0%'/,
    'stale green LoRA progress must be cleared after a failed status load');
  assert.match(panel, /qs\('#freeLoraProgressPercent'\)\.textContent='—'/,
    'failed status must not retain the previous successful percentage');
});

test('a failed LoRA refresh invalidates all displayed status and does not cache false success', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  const panel = source.slice(source.indexOf('async function loadFreeLoraStatus(){'), source.indexOf("qs('#freeLoraRefresh').onclick="));
  const catchBranch = panel.slice(panel.indexOf('}catch(e){'));
  assert.ok(catchBranch.includes("setLoraTag('#freeGpuState','Indisponible','bad')"),
    'GPU completion from a previous run cannot stay green after refresh failure');
  assert.ok(catchBranch.includes("qs('#freeLoraFiles').textContent='Fichiers indisponibles.'"),
    'previous files cannot be presented as current after refresh failure');
  assert.ok(catchBranch.includes("'#freeLoraLessons'"));
  assert.ok(catchBranch.includes("'#freeTrainingExamples'"));
  assert.ok(catchBranch.includes("'#freeCompatibleLoras'"));
  assert.ok(catchBranch.includes("agenticLink.setAttribute('aria-disabled','true')"),
    'stale agentic promotion link must become unavailable');
  assert.match(catchBranch, /throw e;\s*}\s*finally/,
    'loadPanel must not set its success cache timestamp on failed LoRA refresh');
});

test('Free LoRA UI falls back to durable training proof without reusing an unrelated benchmark', async () => {
  const source = await read('src/pages/full-interface-v2.js');
  const panel = source.slice(source.indexOf('async function loadFreeLoraStatus(){'), source.indexOf("qs('#freeLoraRefresh').onclick="));
  assert.match(panel, /verified_training_trace/);
  assert.match(panel, /verifiedTrace\.adapter_digest/);
  assert.match(panel, /impact\?\.artifact_digest/);
  assert.match(panel, /impact\?\.source_sha/);
  assert.match(panel, /benchmarkVerified&&agenticKnown/);
  assert.match(panel, /BENCHMARK CANONIQUE NON PROUVÉ/);
  assert.match(panel, /BENCHMARK HISTORIQUE NON RELIÉ AU CHECKPOINT/);
  assert.doesNotMatch(panel, /bench\.latest_score!=null/, 'a prior benchmark score must not certify the current adapter');
  assert.match(panel, /const knownStages=\[/);
  assert.doesNotMatch(panel, /\{known:promotionApplicable,done:promotionDone\}/, 'hidden promotion does not belong in the three-stage progress');
});
