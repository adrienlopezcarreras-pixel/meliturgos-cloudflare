import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLearnedRuntimeProfile } from '../src/learning/runtime-profile.js';

test('measured inference settings are applied without overriding explicit request settings', () => {
  const profile={settings:{temperature:0.2,top_p:0.7,max_tokens:1800,memory_results:8,council_min_responses:3}};
  const applied=applyLearnedRuntimeProfile({model:'model-a',input:{messages:[]},profile,fallbackMaxTokens:4096});
  assert.equal(applied.payload.temperature,0.2);
  assert.equal(applied.payload.top_p,0.7);
  assert.equal(applied.payload.max_tokens,1800);
  assert.equal(applied.applied.settings,true);

  const explicit=applyLearnedRuntimeProfile({model:'model-a',input:{messages:[],temperature:0.9,top_p:0.95,max_tokens:500},profile});
  assert.equal(explicit.payload.temperature,0.9);
  assert.equal(explicit.payload.top_p,0.95);
  assert.equal(explicit.payload.max_tokens,500);
});

test('non-object inference payload remains untouched', () => {
  const out=applyLearnedRuntimeProfile({model:'model-a',input:'texte',profile:{settings:{temperature:0.1}}});
  assert.equal(out.payload,'texte');
  assert.equal(out.applied.settings,false);
});
