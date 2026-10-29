import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEL_DUAL_LORA_MODELS,
  MEL_DUAL_LORA_RESOURCES,
  MEL_QWEN3_TRAINING_STAGES,
  MEL_ABLITERATION_STAGES,
  MEL_DUAL_LORA_TRAINING_MARKUP,
} from '../src/pages/dual-lora-training-plan.js';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('separate Mistral and Qwen3 model plans never claim a Qwen MEL checkpoint', () => {
  assert.deepEqual(MEL_DUAL_LORA_MODELS.map(model => model.id), ['mistral-7b', 'qwen3-14b']);
  assert.equal(MEL_DUAL_LORA_MODELS[0].status, 'PIPELINE_EXISTANT');
  assert.equal(MEL_DUAL_LORA_MODELS[1].status, 'PLANIFIE_NON_ENTRAINE');
  assert.equal(MEL_DUAL_LORA_MODELS[1].base_model, 'Qwen/Qwen3-14B');
  assert.equal(MEL_DUAL_LORA_MODELS[1].reference_adapter, 'nicoboss/Qwen3-14B-Uncensored-Lora');
  assert.notEqual(MEL_DUAL_LORA_MODELS[0].base_model, MEL_DUAL_LORA_MODELS[1].base_model);
});

test('owner-supplied reference links are curated and lead to real HTTPS addresses', () => {
  assert.equal(MEL_DUAL_LORA_RESOURCES.length, 12);
  const hrefs = MEL_DUAL_LORA_RESOURCES.map(item => item.href);
  for (const href of hrefs) assert.ok(href.startsWith('https://'), href);
  for (const link of [
    'https://colab.research.google.com/drive/1VYm3hOcvCpbGiqKZb141gJwjdmmCcVpR?usp=sharing',
    'https://huggingface.co/nicoboss/Qwen3-14B-Uncensored-Lora',
    'https://erichartford.com/uncensored-models',
    'https://medium.com/@mlabonne/uncensor-any-llm-with-abliteration-d30148b7d43e',
  ]) assert.ok(hrefs.includes(link), link);
});

test('Professor training screen shows plan and never adds a false Qwen launch action', async () => {
  const html = await (await onRequestGet()).text();
  assert.equal((html.match(/id="dualLoraTrainingPlan"/g)||[]).length, 1);
  assert.equal((html.match(/id="freeLoraTrain"/g)||[]).length, 1);
  assert.match(html, /Qwen3 : planifié, non activé/);
  assert.match(html, /Routage et secours/);
  assert.match(html, /Plan de travail du nouveau Qwen3-14B/);
  assert.match(html, /Recette QLoRA et paramètres proposés/);
  assert.match(html, /2 × RTX 4090 24 Go/);
  assert.match(html, /maximum 50 steps/);
  assert.match(html, /Code prêt · service Qwen non activé/);
  assert.match(html, /Le bouton « Lancer un entraînement » ci-dessus concerne toujours Mistral/);
  assert.match(MEL_DUAL_LORA_TRAINING_MARKUP, /href="https:\/\/colab\.research\.google\.com\/drive\//);
  assert.doesNotMatch(MEL_DUAL_LORA_TRAINING_MARKUP, /onclick=|fetch\(|<script/);
});

test('Qwen milestones are a non-executing evidence-based schedule', () => {
  assert.deepEqual(MEL_QWEN3_TRAINING_STAGES.map(s => s.id), ['audit','baseline','smoke','train','eval','serve','switch']);
  assert.ok(MEL_QWEN3_TRAINING_STAGES.every(s => s.status !== 'TERMINÉ' && s.status !== 'ACTIVE'));
  assert.match(MEL_DUAL_LORA_TRAINING_MARKUP, /ni de faux reçu LoRA/i);
  assert.doesNotMatch(MEL_DUAL_LORA_TRAINING_MARKUP, /<script|onclick=|fetch\(/);
});

test('abliteration is shown as an isolated non-executing experiment with honest progress', async () => {
  assert.deepEqual(MEL_ABLITERATION_STAGES.map(s=>s.id), ['reference','baseline','experiment','compare','promotion']);
  const html=await (await onRequestGet()).text();
  assert.match(html,/Expérience C — Abliteration/);
  assert.match(html,/id="qwenTrainingState">Non lancé/);
  assert.match(html,/id="qwenTrainingLastRun">Aucun run GPU vérifié/);
  assert.match(html,/id="qwenTrainingCheckpoint">Aucun artefact PEFT vérifié/);
  assert.match(html,/id="abliterationTrainingState">Non lancé/);
  assert.match(html,/id="abliterationProgressText">Non mesuré/);
  assert.match(html,/Étapes d'abliteration réellement prouvées/);
  assert.match(html,/Aucune commande automatique ni suivi GPU live/);
  assert.doesNotMatch(MEL_DUAL_LORA_TRAINING_MARKUP,/<script|onclick=|fetch\(/);
});

test('experimental controls connect to authenticated server workflow dispatch, not fake GPU success',async()=>{
 const html=await (await onRequestGet()).text();
 for(const id of ['qwenPreflight','qwenRefresh','abliterationPreflight','abliterationRefresh']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.ok(html.includes('/api/learning/lora/experimental/train'));
 assert.match(html,/experimentalTrainingLaunch/);
 assert.match(html,/aucun GPU engagé/);
 const entry=await (await import('node:fs/promises')).readFile(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');
 assert.ok(entry.includes('requireAuth(request,env)'));
 assert.match(entry,/GITHUB_DISPATCH_TOKEN_NOT_CONFIGURED/);
 assert.match(entry,/workflow_dispatch|dispatches/);
});

test('unattributed GitHub preflight runs never become Qwen or Abliteration progress',async()=>{
 const entry=await (await import('node:fs/promises')).readFile(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');
 const ui=await (await import('node:fs/promises')).readFile(new URL('../src/pages/full-interface-v2.js',import.meta.url),'utf8');
 assert.ok(entry.includes('runs:inspected.filter(item=>item.attributed===track).map(projected)'));
 assert.ok(entry.includes('run_track_not_proven:inspected.some(item=>!item.attributed)'));
 assert.ok(ui.includes('aucune preuve ne les attribue à cette piste'));
});

test('GitHub job names provide verified preflight track provenance',async()=>{
 const fs=await import('node:fs/promises');
 const workflow=await fs.readFile(new URL('../.github/workflows/professor-experimental-training.yml',import.meta.url),'utf8');
 const entry=await fs.readFile(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');
 assert.ok(workflow.includes('name: preflight-'));
 assert.ok(entry.includes("name==='preflight-qwen3'||name==='preflight-abliteration'"));
 assert.ok(entry.includes('attributed:matched.length===1'));
});

test('GPU launch cannot masquerade as a completed preflight',async()=>{
 const fs=await import('node:fs/promises');
 const entry=await fs.readFile(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');
 assert.ok(entry.includes('QWEN_GPU_DATASET_MANIFEST_AND_KAGGLE_EXECUTOR_REQUIRED'));
 assert.ok(entry.includes('ABLITERATION_GPU_EXECUTOR_NOT_IMPLEMENTED'));
 assert.ok(entry.includes('gpu_training_performed:false},409'));
});
