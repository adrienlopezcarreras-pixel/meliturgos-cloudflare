import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredAiCandidateReport } from '../../src/portability/configured-ai-candidate-sync.js';

test('configured AI providers become exact sovereignty candidates without secret values',()=>{
  const report=configuredAiCandidateReport({
    MEL_ALT_AI_PROVIDERS_JSON:JSON.stringify([{
      id:'ai.alt',
      provider:'provider-x',
      model:'m1',
      endpoint:'https://api.provider-x.example/v1/chat/completions',
      secret_env:'ALT_AI_TOKEN',
    }]),
    ALT_AI_TOKEN:'top-secret',
  },{now:Date.UTC(2026,8,28,18,0,0)});

  const row=report.results[0].candidate_hints[0];
  assert.equal(row.id,'ai.alt');
  assert.equal(row.provider_hint,'provider-x');
  assert.equal(row.status,'UNVERIFIED');
  assert.equal(row.prevalidated,false);
  assert.equal(row.activation_allowed,false);
  assert.equal(JSON.stringify(report).includes('top-secret'),false);
});
