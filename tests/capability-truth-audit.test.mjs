import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { registerCapabilityAuditCapability } from '../src/capabilities/capability-audit-capability.js';
import { auditRuntimeCapabilities, SAFE_SAMPLES, classifyCapabilityTruth } from '../src/diagnostics/capability-truth-audit.js';

test('truth audit inventories every registered runtime capability without omission', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const registered = runtime.bus.list();
  const report = await auditRuntimeCapabilities(runtime, { deep: false });
  assert.equal(report.ok, true);
  assert.equal(report.total, registered.length);
  assert.ok(report.total >= 14, `expected at least 14 capabilities, got ${report.total}`);
  const ids = new Set(report.capabilities.map(row => row.id));
  for (const record of registered) assert.ok(ids.has(record.id), `missing ${record.id}`);
  for (const row of report.capabilities) {
    assert.ok(row.truth_status);
    assert.equal(row.tested_now, false);
    assert.equal(row.auto_execution_blocked, null);
    assert.ok(['LOW','MEDIUM','HIGH'].includes(row.risk), `unexpected risk for ${row.id}: ${row.risk}`);
  }
});

test('safe smoke catalogue covers core read-only and preview-only capabilities', () => {
  for (const id of [
    'echo','roadmap.read','system.bindings','code.read','code.search','conversation.list','rag.search',
    'chatgpt.archive.preview','capability.audit','autonomy.status','mentor.recent','evolution.gap.detect',
    'evolution.module.propose','device.policy.preview','web.research',
    'github.repository.read','github.actions.runs.read','cloudflare.workers.read','cloudflare.deployments.read',
    'gmail.messages.search','calendar.events.read','tasks.tasklists.read','mail.messages.search',
    'files.list','files.search','drive.files.list','drive.files.search','sites.list','sites.search',
    'roadmap.human-actions-required','system.integrity','system.maturity','chatgpt.history.search',
    'computer.status','work.plan.list','openloop.due','timeline.list','project.list','decision.list',
    'lesson.list','skill.list','skill.snapshot.export','self.audit.status','memory.status','knowledge.search',
    'evolution.ledger.list','resilience.recovery.drill.latest','resilience.cold-standby.prepare.latest'
  ]) {
    assert.ok(Object.hasOwn(SAFE_SAMPLES, id), `missing bounded smoke sample for ${id}`);
  }
  assert.deepEqual(SAFE_SAMPLES['capability.audit'], { deep: false });
});

test('capability.audit can prove itself through a bounded non-recursive smoke sample', async () => {
  const bus = new CapabilityBus();
  registerCapabilityAuditCapability(bus);
  const report = await auditRuntimeCapabilities({ bus }, { deep: true });
  const row = report.capabilities.find(item => item.id === 'capability.audit');
  const statusRow = report.capabilities.find(item => item.id === 'capability.audit.status');
  assert.equal(report.total, 2);
  assert.equal(row.tested_now, true);
  assert.equal(row.auto_execution_blocked, null);
  assert.equal(row.truth_status, 'EXISTANT_ET_TESTE');
  assert.equal(row.execution.ok, true);
  assert.equal(row.execution.result_type, 'object');
  assert.ok(Number.isFinite(row.execution.duration_ms));
  assert.ok(row.execution.duration_ms >= 0);
  assert.equal(statusRow.tested_now, false);
  assert.equal(statusRow.truth_status, 'BLOCKED_EXTERNAL');
});

test('shared truth classifier never promotes healthy registration to tested proof', () => {
  assert.equal(classifyCapabilityTruth({ enabled:true, health:'HEALTHY' }), 'EXISTANT_NON_TESTE');
  assert.equal(classifyCapabilityTruth({ enabled:true, health:'HEALTHY' }, { ok:true }), 'EXISTANT_ET_TESTE');
  assert.equal(classifyCapabilityTruth({ enabled:true, health:'HEALTHY', implementation_status:'STUB' }, { ok:true }), 'STUB');
  assert.equal(classifyCapabilityTruth({ enabled:false, health:'HEALTHY' }), 'BLOCKED');
});

test('deep audit executes bounded LOW-risk samples and reports failures instead of inventing success', async () => {
  const records = [
    { id:'ok', name:'OK', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'bad', name:'BAD', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'medium', name:'MEDIUM', category:'test', provider:'test', risk:'MEDIUM', enabled:true, health:'HEALTHY' },
  ];
  const fake = {
    bus: {
      refreshHealthAll: async () => records,
      list: () => records,
      execute: async (id) => {
        if (id === 'bad') throw Object.assign(new Error('EXPECTED_FAILURE'), { code:'EXPECTED_FAILURE' });
        return { ok:true };
      },
    },
  };
  const report = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ ok:{}, bad:{}, medium:{} },
  });
  assert.equal(report.total, 3);
  const ok = report.capabilities.find(x => x.id === 'ok');
  const bad = report.capabilities.find(x => x.id === 'bad');
  const medium = report.capabilities.find(x => x.id === 'medium');
  assert.equal(ok.tested_now, true);
  assert.equal(ok.auto_execution_blocked, null);
  assert.equal(ok.truth_status, 'EXISTANT_ET_TESTE');
  assert.equal(bad.tested_now, true);
  assert.equal(bad.auto_execution_blocked, null);
  assert.equal(bad.truth_status, 'EXISTANT_MAIS_ECHEC_RUNTIME');
  assert.equal(bad.execution.code, 'EXPECTED_FAILURE');
  assert.ok(Number.isFinite(ok.execution.duration_ms));
  assert.ok(Number.isFinite(bad.execution.duration_ms));
  assert.equal(medium.tested_now, false);
  assert.equal(medium.auto_execution_blocked, 'RISK_NOT_LOW');
  assert.equal(medium.truth_status, 'EXISTANT_NON_TESTE');
});

test('deep audit times out one hung LOW-risk smoke and continues with later capabilities', async () => {
  const records = [
    { id:'hung', name:'Hung', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'after', name:'After', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY' },
  ];
  const fake = {
    bus: {
      list: () => records,
      execute: async (id) => {
        if (id === 'hung') return new Promise(() => {});
        return { ok:true };
      },
    },
  };
  const progress = [];
  const report = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ hung:{}, after:{} },
    executionTimeoutMs:50,
    onProgress: async ({ row }) => progress.push(row.id),
  });
  assert.equal(report.total, 2);
  assert.equal(report.capabilities[0].truth_status, 'EXISTANT_MAIS_ECHEC_RUNTIME');
  assert.equal(report.capabilities[0].execution.code, 'CAPABILITY_AUDIT_EXECUTION_TIMEOUT');
  assert.equal(report.capabilities[1].truth_status, 'EXISTANT_ET_TESTE');
  assert.deepEqual(progress, ['hung','after']);
});

test('deep audit explains every local reason that prevents bounded automatic execution', async () => {
  const calls = [];
  const records = [
    { id:'disabled', name:'Disabled', category:'test', provider:'test', risk:'LOW', enabled:false, health:'HEALTHY' },
    { id:'missing-sample', name:'No sample', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'high', name:'High risk', category:'test', provider:'test', risk:'HIGH', enabled:true, health:'HEALTHY' },
    { id:'stub', name:'Stub', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY', implementation_status:'STUB' },
  ];
  const fake = {
    bus: {
      refreshHealthAll: async () => records,
      list: () => records,
      execute: async (id) => { calls.push(id); return { ok:true }; },
    },
  };
  const report = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ disabled:{}, high:{}, stub:{} },
  });
  assert.equal(report.capabilities.find(x => x.id === 'disabled').auto_execution_blocked, 'DISABLED');
  assert.equal(report.capabilities.find(x => x.id === 'missing-sample').auto_execution_blocked, 'NO_BOUNDED_SAMPLE');
  assert.equal(report.capabilities.find(x => x.id === 'high').auto_execution_blocked, 'RISK_NOT_LOW');
  assert.equal(report.capabilities.find(x => x.id === 'stub').auto_execution_blocked, 'DECLARED_NON_EXECUTABLE');
  assert.deepEqual(calls, []);
});

test('deep audit fails closed on provider/cost-sensitive samples until exact zero-cost proof is supplied', async () => {
  const calls = [];
  const records = [
    { id:'web.research', name:'Web research', category:'research', provider:'external', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'device.policy.preview', name:'Device preview', category:'device', provider:'local', risk:'LOW', enabled:true, health:'HEALTHY' },
  ];
  const fake = {
    bus: {
      refreshHealthAll: async () => records,
      list: () => records,
      execute: async (id) => { calls.push(id); return { ok:true }; },
    },
  };

  const blocked = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ 'web.research':{}, 'device.policy.preview':{} },
  });
  const webBlocked = blocked.capabilities.find(x => x.id === 'web.research');
  const device = blocked.capabilities.find(x => x.id === 'device.policy.preview');
  assert.equal(webBlocked.tested_now, false);
  assert.equal(webBlocked.auto_execution_blocked, 'UNKNOWN_OR_EXTERNAL_COST');
  assert.equal(webBlocked.truth_status, 'EXISTANT_NON_TESTE');
  assert.equal(device.tested_now, true);
  assert.equal(device.auto_execution_blocked, null);
  assert.deepEqual(calls, ['device.policy.preview']);

  const approved = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ 'web.research':{} },
    zeroCostCapabilityIds:['web.research'],
  });
  const webApproved = approved.capabilities.find(x => x.id === 'web.research');
  assert.equal(webApproved.tested_now, true);
  assert.equal(webApproved.auto_execution_blocked, null);
  assert.equal(webApproved.truth_status, 'EXISTANT_ET_TESTE');
  assert.deepEqual(calls, ['device.policy.preview', 'web.research']);
});

test('declared STUB and NOT_IMPLEMENTED capabilities cannot masquerade as healthy or be smoke-executed', async () => {
  const calls = [];
  const records = [
    { id:'stub', name:'Stub', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY', implementation_status:'STUB' },
    { id:'missing', name:'Missing', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY', implementation_status:'NOT_IMPLEMENTED' },
    { id:'partial', name:'Partial', category:'test', provider:'test', risk:'LOW', enabled:true, health:'HEALTHY', implementation_status:'PARTIAL' },
  ];
  const fake = {
    bus: {
      refreshHealthAll: async () => records,
      list: () => records,
      execute: async (id) => { calls.push(id); return { ok:true }; },
    },
  };
  const report = await auditRuntimeCapabilities(fake, {
    deep:true,
    samples:{ stub:{}, missing:{}, partial:{} },
  });
  const stub = report.capabilities.find(x => x.id === 'stub');
  const missing = report.capabilities.find(x => x.id === 'missing');
  const partial = report.capabilities.find(x => x.id === 'partial');
  assert.equal(stub.truth_status, 'STUB');
  assert.equal(stub.tested_now, false);
  assert.equal(stub.auto_execution_blocked, 'DECLARED_NON_EXECUTABLE');
  assert.equal(missing.truth_status, 'NOT_IMPLEMENTED');
  assert.equal(missing.tested_now, false);
  assert.equal(missing.auto_execution_blocked, 'DECLARED_NON_EXECUTABLE');
  assert.equal(partial.truth_status, 'EXISTANT_ET_TESTE');
  assert.equal(partial.auto_execution_blocked, null);
  assert.deepEqual(calls, ['partial']);
});


test('deep audit never executes a capability whose refreshed health is unavailable', async () => {
  let executions = 0;
  const record = {
    id:'external.read',
    name:'External read',
    category:'test',
    provider:'external',
    risk:'LOW',
    enabled:true,
    health:'UNAVAILABLE',
  };
  const bus = {
    list: () => [record],
    refreshHealth: async () => record,
    contract: () => ({ valid:true }),
    execute: async () => { executions += 1; return { ok:true }; },
  };
  const report = await auditRuntimeCapabilities({ bus }, {
    deep:true,
    samples:{ 'external.read':{} },
  });
  const row = report.capabilities[0];
  assert.equal(row.tested_now,false);
  assert.equal(row.auto_execution_blocked,'HEALTH_UNAVAILABLE');
  assert.equal(row.truth_status,'BLOCKED_EXTERNAL');
  assert.equal(executions,0);
});


test('deep audit can derive a real bounded fixture before testing an ID-based read', async () => {
  const records = [
    { id:'thing.list', name:'List', category:'test', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' },
    { id:'thing.get', name:'Get', category:'test', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' },
  ];
  const calls=[];
  const runtime={
    bus:{
      list:()=>records,
      contract:()=>({valid:true}),
      execute:async(id,input)=>{
        calls.push({id,input});
        if(id==='thing.list') return [{ id:'real-1' }];
        if(id==='thing.get') return { id:input.id };
        throw new Error('unexpected');
      },
    },
  };
  const report=await auditRuntimeCapabilities(runtime,{
    deep:true,
    samples:{
      'thing.list':{},
      'thing.get':async({runtime,context})=>{
        const rows=await runtime.bus.execute('thing.list',{},context);
        return rows[0]?.id?{id:rows[0].id}:undefined;
      },
    },
  });
  const get=report.capabilities.find(row=>row.id==='thing.get');
  assert.equal(get.tested_now,true);
  assert.equal(get.truth_status,'EXISTANT_ET_TESTE');
  assert.ok(calls.some(call=>call.id==='thing.get'&&call.input.id==='real-1'));
});

test('dynamic bounded fixture absence is reported without manufacturing a runtime failure', async () => {
  const record={ id:'thing.get', name:'Get', category:'test', provider:'core', risk:'LOW', enabled:true, health:'HEALTHY' };
  let executions=0;
  const runtime={bus:{list:()=>[record],contract:()=>({valid:true}),execute:async()=>{executions+=1;return{};}}};
  const report=await auditRuntimeCapabilities(runtime,{
    deep:true,
    samples:{'thing.get':async()=>undefined},
  });
  const row=report.capabilities[0];
  assert.equal(row.tested_now,false);
  assert.equal(row.auto_execution_blocked,'NO_RUNTIME_FIXTURE');
  assert.equal(row.truth_status,'EXISTANT_NON_TESTE');
  assert.equal(executions,0);
});


test('CapabilityBus contract proof is non-executing and validates guarded structure', async () => {
  let executions = 0;
  const bus = new CapabilityBus();
  bus.discover({
    id:'high.contract',
    name:'High contract',
    category:'test',
    version:'1.0.0',
    provider:'test',
    description:'contract only',
    input_schema:{type:'object',properties:{},additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'HIGH',
    permissions:['danger.execute'],
    health:'HEALTHY',
    enabled:true,
  }, async () => { executions += 1; return { ok:true }; });

  const contract = bus.contract('high.contract');
  assert.equal(contract.valid, true);
  assert.equal(contract.handler_registered, true);
  assert.equal(contract.authorization_gate, true);
  assert.equal(contract.input_validation_gate, true);
  assert.equal(contract.output_validation_gate, true);
  assert.equal(executions, 0, 'contract inspection must never execute the capability');
});

test('deep audit proves contract of MEDIUM/HIGH capabilities without executing side effects', async () => {
  let executions = 0;
  const bus = new CapabilityBus();
  for (const risk of ['MEDIUM','HIGH']) {
    bus.discover({
      id:'guarded.'+risk.toLowerCase(),
      name:'Guarded '+risk,
      category:'test',
      version:'1.0.0',
      provider:'test',
      description:'guarded contract',
      input_schema:{type:'object',properties:{},additionalProperties:false},
      output_schema:{type:'object',additionalProperties:true},
      risk,
      permissions:['guarded.execute'],
      health:'HEALTHY',
      enabled:true,
    }, async () => { executions += 1; return { ok:true }; });
  }
  const report = await auditRuntimeCapabilities({ bus }, {
    deep:true,
    samples:{ 'guarded.medium':{}, 'guarded.high':{} },
  });
  assert.deepEqual(report.contracts, { inspected:2, valid:2, invalid:0 });
  for (const row of report.capabilities) {
    assert.equal(row.contract_valid, true);
    assert.equal(row.contract.handler_registered, true);
    assert.equal(row.tested_now, false);
    assert.equal(row.auto_execution_blocked, 'RISK_NOT_LOW');
    assert.equal(row.truth_status, 'EXISTANT_NON_TESTE');
  }
  assert.equal(executions, 0);
});


test('deep audit bounds and parallelizes health refresh while preserving capability order', async () => {
  const records = Array.from({ length: 10 }, (_, index) => ({
    id:'health-'+index,
    name:'Health '+index,
    category:'test',
    provider:'test',
    risk:'LOW',
    enabled:true,
    health:'DEGRADED',
  }));
  let active=0;
  let peak=0;
  const refreshed=[];
  const bus={
    list:()=>records,
    async refreshHealth(id){
      active += 1;
      peak=Math.max(peak,active);
      refreshed.push(id);
      await new Promise(resolve=>setTimeout(resolve,10));
      active -= 1;
      return { ...records.find(row=>row.id===id), health:'HEALTHY' };
    },
    contract:()=>({valid:true}),
    execute:async()=>({ok:true}),
  };
  const report=await auditRuntimeCapabilities({bus},{deep:true,samples:{}});
  assert.equal(report.total,10);
  assert.deepEqual(report.capabilities.map(row=>row.id),records.map(row=>row.id));
  assert.equal(report.capabilities.every(row=>row.health==='HEALTHY'),true);
  assert.ok(peak>1,'health refresh should run concurrently');
  assert.ok(peak<=8,'health refresh concurrency must stay bounded');
  assert.equal(refreshed.length,10);
});
