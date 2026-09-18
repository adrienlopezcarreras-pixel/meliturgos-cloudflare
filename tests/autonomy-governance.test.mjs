import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSION_TIERS,
  createInMemoryAgentAutomationPolicyAdapter,
} from '../src/automations/agent-automation-policy.js';

test('canonical automation governance fails closed without explicit destructive approval', async () => {
  const adapter=createInMemoryAgentAutomationPolicyAdapter();
  const base={
    policy:{
      automation_id:'auto-1',
      agent_id:'mel',
      required_capabilities:['mail.send'],
      permission_tier:PERMISSION_TIERS.DESTRUCTIVE,
      enabled:true,
    },
    run_id:'run-1',
    idempotency_key:'idem-1',
    owner:'adrien',
    granted_capabilities:['mail.send'],
    granted_tier:PERMISSION_TIERS.DESTRUCTIVE,
    requested_at:1,
  };
  await assert.rejects(()=>adapter.authorizeRun({...base,approved:false}),/AUTOMATION_EXPLICIT_APPROVAL_REQUIRED/);
  const first=await adapter.authorizeRun({...base,approved:true});
  assert.equal(first.claim.status,'AUTHORIZED');
  assert.equal(first.deduplicated,false);
  const duplicate=await adapter.authorizeRun({...base,approved:true});
  assert.equal(duplicate.deduplicated,true);
  assert.equal(duplicate.claim.run_id,'run-1');
});

test('permission tiers cannot be silently elevated', async () => {
  const adapter=createInMemoryAgentAutomationPolicyAdapter();
  await assert.rejects(()=>adapter.authorizeRun({
    policy:{automation_id:'auto-2',agent_id:'mel',required_capabilities:['repo.write'],permission_tier:PERMISSION_TIERS.SENSITIVE},
    run_id:'run-2',idempotency_key:'idem-2',owner:'adrien',
    granted_capabilities:['repo.write'],granted_tier:PERMISSION_TIERS.READ,requested_at:2,
  }),/AUTOMATION_PERMISSION_TIER_DENIED/);
});
