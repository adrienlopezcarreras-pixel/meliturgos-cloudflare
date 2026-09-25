import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERMISSION_TIERS,
  RUN_STATUSES,
  createAgentAutomationPolicy,
} from '../../src/automations/agent-automation-policy.js';
import {
  createD1AgentAutomationPolicyAdapter,
} from '../../src/automations/d1-agent-automation-policy.js';

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) { this.db=db; this.sql=compact(sql); this.args=[]; }
  bind(...args) { this.args=args; return this; }

  async run() {
    const sql=this.sql;
    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) {
      return { success:true, meta:{changes:0} };
    }
    if (sql.startsWith('INSERT INTO agent_automation_runs')) {
      const [
        run_id,idempotency_key,automation_id,agent_id,owner,
        required_capabilities_json,permission_tier,status,requested_at,
        completed_at,failed_at,error_code,result_json,policy_json,updated_at
      ]=this.args;
      if (this.db.byRun.has(run_id) || this.db.byIdem.has(idempotency_key)) {
        throw new Error('SQLITE_CONSTRAINT_UNIQUE');
      }
      const row={run_id,idempotency_key,automation_id,agent_id,owner,
        required_capabilities_json,permission_tier,status,requested_at,
        completed_at,failed_at,error_code,result_json,policy_json,updated_at};
      this.db.byRun.set(run_id,row); this.db.byIdem.set(idempotency_key,run_id);
      return { success:true, meta:{changes:1} };
    }
    if (sql.startsWith('UPDATE agent_automation_runs SET status=?, completed_at=?')) {
      const [status,completed_at,result_json,updated_at,run_id,requiredStatus]=this.args;
      const row=this.db.byRun.get(run_id);
      if(!row || row.status!==requiredStatus) return {success:true,meta:{changes:0}};
      Object.assign(row,{status,completed_at,result_json,updated_at});
      return {success:true,meta:{changes:1}};
    }
    if (sql.startsWith('UPDATE agent_automation_runs SET status=?, failed_at=?')) {
      const [status,failed_at,error_code,result_json,updated_at,run_id,requiredStatus]=this.args;
      const row=this.db.byRun.get(run_id);
      if(!row || row.status!==requiredStatus) return {success:true,meta:{changes:0}};
      Object.assign(row,{status,failed_at,error_code,result_json,updated_at});
      return {success:true,meta:{changes:1}};
    }
    throw new Error('UNEXPECTED_SQL_RUN:'+sql);
  }

  async first() {
    if (this.sql==='SELECT * FROM agent_automation_runs WHERE run_id=?') {
      const row=this.db.byRun.get(this.args[0]); return row?structuredClone(row):null;
    }
    if (this.sql==='SELECT * FROM agent_automation_runs WHERE idempotency_key=?') {
      const id=this.db.byIdem.get(this.args[0]); const row=id?this.db.byRun.get(id):null;
      return row?structuredClone(row):null;
    }
    throw new Error('UNEXPECTED_SQL_FIRST:'+this.sql);
  }

  async all() {
    if (!this.sql.startsWith('SELECT * FROM agent_automation_runs')) {
      throw new Error('UNEXPECTED_SQL_ALL:'+this.sql);
    }
    let rows=[...this.db.byRun.values()];
    let i=0;
    if (this.sql.includes('status=?')) {
      const status=this.args[i++]; rows=rows.filter(r=>r.status===status);
    }
    if (this.sql.includes('automation_id=?')) {
      const automationId=this.args[i++]; rows=rows.filter(r=>r.automation_id===automationId);
    }
    const limit=this.args[i];
    rows.sort((a,b)=>a.requested_at-b.requested_at || a.run_id.localeCompare(b.run_id));
    return {results:structuredClone(rows.slice(0,limit))};
  }
}

class FakeD1 {
  constructor(){ this.byRun=new Map(); this.byIdem=new Map(); }
  prepare(sql){ return new FakeStatement(this,sql); }
}

function policy(overrides={}) {
  return {
    automation_id:'auto-1',
    agent_id:'agent-1',
    required_capabilities:['memory.read'],
    permission_tier:PERMISSION_TIERS.READ,
    enabled:true,
    metadata:{},
    ...overrides,
  };
}

function request(overrides={}) {
  return {
    run_id:'run-1',
    idempotency_key:'idem-1',
    owner:'adrien',
    granted_capabilities:['memory.read'],
    granted_tier:PERMISSION_TIERS.READ,
    requested_at:1_000,
    approved:false,
    ...overrides,
  };
}

test('D1 automation policy survives adapter recreation and preserves authorized claim', async()=>{
  const db=new FakeD1();
  const first=createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  const initial=await first.authorizeRun({policy:policy(),...request()});
  assert.equal(initial.deduplicated,false);
  assert.equal(initial.claim.status,RUN_STATUSES.AUTHORIZED);

  const second=createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  const restored=await second.getRun({run_id:'run-1'});
  assert.equal(restored.owner,'adrien');
  assert.equal(restored.agent_id,'agent-1');
  assert.deepEqual(restored.required_capabilities,['memory.read']);
});

test('D1 automation policy keeps idempotency durable across restarts', async()=>{
  const db=new FakeD1();
  const first=createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  await first.authorizeRun({policy:policy(),...request()});

  const second=createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  const duplicate=await second.authorizeRun({policy:policy(),...request()});
  assert.equal(duplicate.deduplicated,true);

  await assert.rejects(
    ()=>second.authorizeRun({policy:policy({automation_id:'auto-other'}),...request()}),
    {code:'AUTOMATION_IDEMPOTENCY_CONFLICT',status:409},
  );
});

test('D1 automation policy denies insufficient tier/capability and destructive without approval', async()=>{
  const db=new FakeD1();
  const adapter=createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));

  await assert.rejects(
    ()=>adapter.authorizeRun({
      policy:policy({permission_tier:PERMISSION_TIERS.SENSITIVE}),
      ...request({granted_tier:PERMISSION_TIERS.SAFE_WRITE}),
    }),
    {code:'AUTOMATION_PERMISSION_TIER_DENIED',status:403},
  );

  await assert.rejects(
    ()=>adapter.authorizeRun({
      policy:policy({required_capabilities:['memory.read','gmail.send']}),
      ...request({granted_capabilities:['memory.read']}),
    }),
    {code:'AUTOMATION_CAPABILITY_DENIED',status:403},
  );

  await assert.rejects(
    ()=>adapter.authorizeRun({
      policy:policy({permission_tier:PERMISSION_TIERS.DESTRUCTIVE}),
      ...request({granted_tier:PERMISSION_TIERS.DESTRUCTIVE,approved:false}),
    }),
    {code:'AUTOMATION_EXPLICIT_APPROVAL_REQUIRED',status:403},
  );
});

test('D1 automation policy completes and fails runs idempotently', async()=>{
  const db=new FakeD1();
  const adapter=createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));

  await adapter.authorizeRun({policy:policy(),...request()});
  const done=await adapter.completeRun({
    run_id:'run-1',
    completed_at:2_000,
    result:{ok:true},
  });
  assert.equal(done.status,RUN_STATUSES.COMPLETED);
  assert.deepEqual(done.result,{ok:true});
  assert.equal((await adapter.completeRun({run_id:'run-1',completed_at:2_100})).status,RUN_STATUSES.COMPLETED);

  await adapter.authorizeRun({
    policy:policy(),
    ...request({run_id:'run-2',idempotency_key:'idem-2',requested_at:3_000}),
  });
  const failed=await adapter.failRun({
    run_id:'run-2',
    failed_at:4_000,
    error_code:'TOOL_UNAVAILABLE',
    result:{retryable:true},
  });
  assert.equal(failed.status,RUN_STATUSES.FAILED);
  assert.equal(failed.error_code,'TOOL_UNAVAILABLE');
  assert.deepEqual(failed.result,{retryable:true});

  const again=await adapter.failRun({
    run_id:'run-2',
    failed_at:4_100,
    error_code:'TOOL_UNAVAILABLE',
  });
  assert.equal(again.status,RUN_STATUSES.FAILED);

  await assert.rejects(
    ()=>adapter.failRun({
      run_id:'run-2',
      failed_at:4_200,
      error_code:'DIFFERENT',
    }),
    {code:'AUTOMATION_FAILURE_CONFLICT',status:409},
  );
});

test('D1 automation policy lists deterministically with filters', async()=>{
  const db=new FakeD1();
  const adapter=createAgentAutomationPolicy(createD1AgentAutomationPolicyAdapter(db));
  await adapter.authorizeRun({policy:policy({automation_id:'a'}),...request({run_id:'r1',idempotency_key:'i1',requested_at:3_000})});
  await adapter.authorizeRun({policy:policy({automation_id:'b'}),...request({run_id:'r2',idempotency_key:'i2',requested_at:1_000})});
  await adapter.authorizeRun({policy:policy({automation_id:'a'}),...request({run_id:'r3',idempotency_key:'i3',requested_at:2_000})});

  assert.deepEqual(
    (await adapter.listRuns({automation_id:'a'})).map(r=>r.run_id),
    ['r3','r1']
  );
});
