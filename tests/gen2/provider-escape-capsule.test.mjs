import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../../src/capabilities/default-bus.js';
import { createProviderNeutralManifest } from '../../src/portability/provider-neutral-manifest.js';
import {
  PROVIDER_ESCAPE_SCHEMA,
  createProviderEscapeCapsule,
  providerEscapeSummary,
  validateProviderEscapeCapsule,
} from '../../src/portability/provider-escape-capsule.js';

function manifest() {
  return createProviderNeutralManifest({
    generated_at:'2026-09-25T08:00:00.000Z',
    source:{branch:'main',commit:'abc123'},
    contracts:[
      {id:'model.inference',version:'1'},
      {id:'memory.storage',version:'1'},
      {id:'runtime.http',version:'1'},
    ],
    artifacts:[
      {id:'memory-export',contract_id:'memory.storage',format:'jsonl',ref:'bundle/memory.jsonl',checksum:'sha256:1'},
      {id:'runtime-config',contract_id:'runtime.http',format:'json',ref:'bundle/runtime.json',checksum:'sha256:2'},
    ],
    adapters:[
      {id:'ai.current',contract_id:'model.inference',provider:'provider-a',optional:true},
      {id:'ai.alt',contract_id:'model.inference',provider:'provider-b',optional:true},
      {id:'storage.current',contract_id:'memory.storage',provider:'provider-a',optional:true},
      {id:'storage.alt',contract_id:'memory.storage',provider:'local',optional:true},
      {id:'runtime.current',contract_id:'runtime.http',provider:'provider-a',optional:true},
      {id:'runtime.alt',contract_id:'runtime.http',provider:'provider-b',optional:true},
    ],
  });
}

const layers={
  ai:{contract_ids:['model.inference'],current_adapter_ids:['ai.current']},
  storage:{contract_ids:['memory.storage'],current_adapter_ids:['storage.current']},
  runtime:{contract_ids:['runtime.http'],current_adapter_ids:['runtime.current']},
};

test('MEL-RES-03 builds a three-layer provider escape capsule without architecture redeploy', () => {
  const capsule=createProviderEscapeCapsule({
    manifest:manifest(),
    layers,
    generated_at:'2026-09-25T08:30:00.000Z',
  });
  assert.equal(capsule.schema,PROVIDER_ESCAPE_SCHEMA);
  assert.equal(capsule.ready_to_escape,true);
  assert.equal(capsule.policy.architecture_redeploy_required,false);
  assert.equal(capsule.policy.automatic_activation,false);
  assert.deepEqual(capsule.layers.ai.alternative_adapters.map(row=>row.id),['ai.alt']);
  assert.deepEqual(capsule.layers.storage.portable_artifacts.map(row=>row.id),['memory-export']);
  assert.equal(validateProviderEscapeCapsule(capsule).ok,true);
  assert.deepEqual(providerEscapeSummary(capsule),{
    ok:true,
    schema:PROVIDER_ESCAPE_SCHEMA,
    ready_to_escape:true,
    layer_count:3,
    ready_layers:['ai','storage','runtime'],
    blocked_layers:[],
    alternative_adapter_count:3,
    issues:[],
  });
});

test('MEL-RES-03 stays non-ready when a contract has no alternative adapter', () => {
  const source=manifest();
  source.adapters=source.adapters.filter(row=>row.id!=='runtime.alt');
  const capsule=createProviderEscapeCapsule({
    manifest:source,
    layers,
    generated_at:'2026-09-25T08:30:00.000Z',
  });
  assert.equal(capsule.ready_to_escape,false);
  assert.equal(capsule.layers.runtime.ready,false);
  assert.deepEqual(capsule.layers.runtime.blockers,[{code:'ALTERNATIVE_ADAPTER_REQUIRED',contract_id:'runtime.http'}]);
});

test('MEL-RES-03 rejects invalid source manifests and mismatched current adapters', () => {
  const invalid=manifest();
  invalid.metadata={api_token:'forbidden'};
  assert.throws(
    ()=>createProviderEscapeCapsule({manifest:invalid,layers}),
    error=>error.code==='ESCAPE_SOURCE_MANIFEST_INVALID'
  );

  assert.throws(
    ()=>createProviderEscapeCapsule({
      manifest:manifest(),
      layers:{...layers,ai:{contract_ids:['model.inference'],current_adapter_ids:['storage.current']}},
    }),
    error=>error.code==='ESCAPE_LAYER_CURRENT_ADAPTER_CONTRACT_MISMATCH'
  );
});

test('MEL-RES-03 capsule sanitizes accidental secret-shaped metadata and never auto-activates', () => {
  const source=manifest();
  const capsule=createProviderEscapeCapsule({
    manifest:source,
    layers,
    source:{branch:'Bearer abcdefghijklmnop',commit:'abc123'},
    generated_at:'2026-09-25T08:30:00.000Z',
  });
  assert.equal(capsule.source.branch,'[REDACTED]');
  assert.equal(capsule.policy.automatic_activation,false);
  for (const layer of Object.values(capsule.layers)) {
    assert.equal(layer.activation.automatic,false);
    assert.equal(layer.activation.owner_approval_required,true);
    assert.ok(layer.migration_steps.includes('ROLLBACK_TO_PREVIOUS_ADAPTER_ON_FAILURE'));
  }
});

test('CapabilityBus exposes provider escape planning as LOW-risk plan-only capability', async () => {
  const bus=createDefaultCapabilityBus({env:{}});
  const descriptor=bus.describe('portability.escape.plan');
  assert.equal(descriptor.risk,'LOW');
  assert.equal(descriptor.health,'HEALTHY');

  const result=await bus.execute('portability.escape.plan',{
    manifest:manifest(),
    layers,
  },{owner:'test',requestId:'escape-plan',permissions:[]});
  assert.equal(result.capsule.ready_to_escape,true);
  assert.equal(result.summary.ready_to_escape,true);
  assert.equal(result.execution_started,false);
});
