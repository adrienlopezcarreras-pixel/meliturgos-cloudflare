import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEL_DUAL_LORA_MODELS,
  MEL_DUAL_LORA_RESOURCES,
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
  assert.equal(MEL_DUAL_LORA_RESOURCES.length, 8);
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
  assert.match(html, /À développer et prouver/);
  assert.match(html, /Le bouton « Lancer un entraînement » ci-dessus concerne toujours Mistral/);
  assert.match(MEL_DUAL_LORA_TRAINING_MARKUP, /href="https:\/\/colab\.research\.google\.com\/drive\//);
  assert.doesNotMatch(MEL_DUAL_LORA_TRAINING_MARKUP, /onclick=|fetch\(|<script/);
});
