import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { validateCapabilityInventory } from '../src/diagnostics/capability-inventory-gate.js';

test('all registered MEL capabilities receive a complete structural validation row', () => {
  const runtime = createGen2Runtime({ env: {} });
  const registered = runtime.bus.list();
  const result = validateCapabilityInventory(runtime.bus);
  assert.ok(registered.length > 0);
  assert.equal(result.total, registered.length);
  assert.equal(result.inspected, registered.length);
  assert.equal(result.structural_ok, true, JSON.stringify(result.capabilities.filter(x=>!x.contract_valid)));
  assert.equal(result.contracts_invalid, 0);
  assert.equal(result.unimplemented, 0);
  assert.deepEqual(result.capabilities.map(row=>row.id).sort(),
    registered.map(row=>row.id).sort());
  assert.ok(result.capabilities.every(row => row.contract_valid && row.handler_registered));
  assert.ok(result.capabilities.every(row => row.next && row.status && row.risk));
  assert.ok(result.capabilities.every(row => row.runtime_verified === false
    && row.execution_performed === false));
  assert.equal(result.all_validated, false, 'a registered handler is not a live execution proof');
  assert.equal(result.runtime_verified, 0);
});

test('static audit is zero-inference and never invokes, health-refreshes or enables a skill', () => {
  let invoked = 0;
  const fake = {
    list: () => [{id:'healthy-but-untested',risk:'LOW',enabled:true,health:'HEALTHY'},
      {id:'offline-provider',risk:'HIGH',enabled:true,health:'UNAVAILABLE'},
      {id:'explicitly-disabled',risk:'MEDIUM',enabled:false,health:'HEALTHY'}],
    contract: () => ({valid:true,handler_registered:true}),
    execute: () => {invoked++;throw Error('MUST_NOT_RUN');},
    refreshHealth: () => {invoked++;throw Error('MUST_NOT_PROBE');},
    enable: () => {invoked++;throw Error('MUST_NOT_ENABLE');},
  };
  const result = validateCapabilityInventory(fake);
  assert.equal(invoked, 0);
  assert.equal(result.capabilities.find(row=>row.id==='healthy-but-untested').status,
    'CONTRACT_VERIFIED_RUNTIME_UNPROVEN');
  assert.equal(result.capabilities.find(row=>row.id==='offline-provider').status,
    'BLOCKED_EXTERNAL');
  assert.equal(result.capabilities.find(row=>row.id==='explicitly-disabled').status,
    'DISABLED');
  assert.equal(result.contracts_valid, 3);
  assert.equal(result.structural_ok, true);
});

test('duplicate, missing handlers and stub capabilities are never certified', () => {
  const fake = {
    list: () => [
      {id:'same',enabled:true,health:'HEALTHY',risk:'LOW'},
      {id:'same',enabled:true,health:'HEALTHY',risk:'LOW'},
      {id:'stub',enabled:true,health:'HEALTHY',risk:'LOW',implementation_status:'STUB'},
      {id:'unhandled',enabled:true,health:'HEALTHY',risk:'LOW'},
    ],
    contract: id => ({valid:id!=='unhandled',handler_registered:id!=='unhandled'}),
  };
  const result=validateCapabilityInventory(fake);
  assert.equal(result.total, 4);
  assert.equal(result.contracts_invalid, 2);
  assert.equal(result.unimplemented, 1);
  assert.equal(result.structural_ok, false);
  assert.equal(result.all_validated, false);
  assert.ok(result.capabilities.some(row=>row.status==='INVALID_CONTRACT'));
  assert.ok(result.capabilities.some(row=>row.status==='NOT_IMPLEMENTED'));
});

test('invalid registry implementation does not become an invented successful audit', () => {
  assert.throws(() => validateCapabilityInventory({list:()=>[]}),
    {code:'CAPABILITY_BUS_CONTRACT_REQUIRED'});
});
