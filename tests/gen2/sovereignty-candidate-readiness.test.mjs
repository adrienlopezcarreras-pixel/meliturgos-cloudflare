import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCandidateReadiness,
  readinessRequirementsForDescriptor,
} from '../../src/portability/sovereignty-candidate-readiness.js';

function descriptor(overrides={}){
  return {
    id:'ai.alt',
    provider:'alt-ai',
    credential_ref:'ALT_AI_TOKEN',
    added_cost_eur:0,
    cost_provenance:{
      verified:true,
      addedCost:0,
      authorization:{approved:true,policy:'ZERO_EURO',authority:'owner'},
    },
    ...overrides,
  };
}

test('readiness exposes only credential reference presence, never the value',()=>{
  const d=descriptor();
  const req=readinessRequirementsForDescriptor('ai',d);
  const result=evaluateCandidateReadiness(
    {layer:'ai',id:'ai.alt'},
    {
      env:{ALT_AI_TOKEN:'super-secret-value'},
      descriptor:d,
      requiredSecrets:req.required_secrets,
      requiredConfig:req.required_config,
    },
  );
  assert.equal(result.ready_for_live_test,true);
  assert.equal(result.secret_values_exposed,false);
  assert.deepEqual(result.secret_refs,[{ref:'ALT_AI_TOKEN',present:true}]);
  assert.equal(JSON.stringify(result).includes('super-secret-value'),false);
});

test('missing credential blocks live test with exact reference name only',()=>{
  const d=descriptor();
  const req=readinessRequirementsForDescriptor('ai',d);
  const result=evaluateCandidateReadiness(
    {layer:'ai',id:'ai.alt'},
    {env:{},descriptor:d,requiredSecrets:req.required_secrets},
  );
  assert.equal(result.ready_for_live_test,false);
  assert.equal(result.blocking_reason,'CREDENTIAL_REQUIRED');
  assert.deepEqual(result.missing_secrets,['ALT_AI_TOKEN']);
});

test('missing zero-cost proof blocks provider before live test',()=>{
  const d=descriptor({
    cost_provenance:{verified:false,addedCost:0,authorization:{approved:true}},
  });
  const req=readinessRequirementsForDescriptor('ai',d);
  const result=evaluateCandidateReadiness(
    {layer:'ai',id:'ai.alt'},
    {
      env:{ALT_AI_TOKEN:'present'},
      descriptor:d,
      requiredSecrets:req.required_secrets,
    },
  );
  assert.equal(result.ready_for_live_test,false);
  assert.equal(result.blocking_reason,'ZERO_COST_PROOF_REQUIRED');
});

test('required config is reported by reference name without reading arbitrary values',()=>{
  const d=descriptor({
    required_config_refs:['ALT_AI_ENDPOINT_MODE'],
  });
  const req=readinessRequirementsForDescriptor('ai',d);
  const result=evaluateCandidateReadiness(
    {layer:'ai',id:'ai.alt'},
    {
      env:{ALT_AI_TOKEN:'present'},
      descriptor:d,
      requiredSecrets:req.required_secrets,
      requiredConfig:req.required_config,
    },
  );
  assert.equal(result.blocking_reason,'CONFIG_REQUIRED');
  assert.deepEqual(result.missing_config,['ALT_AI_ENDPOINT_MODE']);
});
