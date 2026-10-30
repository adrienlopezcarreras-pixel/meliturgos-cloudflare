import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');
test('missing Kaggle reviewed dataset fails closed with actionable setup',()=>{
  assert.match(source,/QWEN_REVIEWED_KAGGLE_DATASET_NOT_CONFIGURED/);
  assert.match(source,/required_setting:'MEL_QWEN_KAGGLE_DATASET_SLUG'/);
  assert.match(source,/expected_format:'owner\/dataset'/);
  assert.match(source,/gpu_training_performed:false/);
  assert.match(source,/No GPU execution was dispatched/);
});

test('Professor page states exact Kaggle binding prerequisite without claiming GPU proof',()=>{
  const page=readFileSync(new URL('../src/pages/dual-lora-training-plan.js',import.meta.url),'utf8');
  assert.match(page,/MEL_QWEN_KAGGLE_DATASET_SLUG/);
  assert.match(page,/Une demande acceptée ne prouve ni entraînement/);
  assert.doesNotMatch(page,/Aucun bouton de lancement n'est présenté comme opérationnel/);
});
