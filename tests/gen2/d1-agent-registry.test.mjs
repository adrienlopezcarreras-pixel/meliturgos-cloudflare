import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentRegistry } from '../../src/agents/agent-registry.js';
import {
  AgentAutomationGuard,
  createD1AgentRegistryAdapter,
} from '../../src/agents/d1-agent-registry.js';
import {
  PERMISSION_TIERS,
  createAgentAutomationPolicy,
  createInMemoryAgentAutomationPolicyAdapter,
} from '../../src/automations/agent-automation-policy.js';

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) { this.db=db; this.sql=compact(sql); this.args=[]; }
  bind(...args) { this.args=args; return this; }

  async run() {
    const sql=this.sql;
    if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) {
      return {success:true,meta:{changes:0}};
    }
    if (sql.startsWith('INSERT INTO mel_agents')) {
      const [
        owner,agent_id,name,role,capabilities_json,permission_ceiling,
        enabled,metadata_json,created_at,updated_at
      ]=this.args;
      const key=owner+'::'+agent_id;
      if (this.db.rows.has(key)) throw new Error('SQLITE_CONSTRAINT_PRIMARYKEY');
      this.db.rows.set(key,{
        owner,agent_id,name,role,capabilities_json,permission_ceiling,
        enabled,metadata_json,created_at,updated_at
      });
      return {success:true,meta:{changes:1}};
    }
    if (sql.startsWith('UPDATE mel_agents SET enabled=0')) {
      const [updated_at,owner,agent_id]=this.args;
      const row=this.db.rows.get(owner+'::'+agent_id);
      if(!row || !row.enabled) return {success:true,meta:{changes:0}};
      row.enabled=0; row.updated_at=updated_at;
      return {success:true,meta:{changes:1}};
    }
    throw new Error('UNEXPECTED_SQL_RUN:'+sql);
  }

  async first() {
    if (this.sql==='SELECT * FROM mel_agents WHERE owner=? AND agent_id=?') {
      const row=this.db.rows.get(this.args[0]+'::'+this.args[1]);
      return row?structuredClone(row):null;
    }
    throw new Error('UNEXPECTED_SQL_FIRST:'+this.sql);
  }

  async all() {
    if (!this.sql.startsWith('SELECT * FROM mel_agents WHERE owner=?')) {
      throw new Error('UNEXPECTED_SQL_ALL:'+this.sql);
    }
    const owner=this.args[0];
    let rows=[...this.db.rows.values()].filter(r=>r.owner===owner);
    let limit;
    if (this.sql.includes('AND enabled=?')) {
      const enabled=this.args[1]; limit=this.args[2];
      rows=rows.filter(r=>r.enabled===enabled);
    } else {
      limit=this.args[1];
    }
    rows.sort((a,b)=>a.agent_id.localeCompare(b.agent_id));
    return {results:structuredClone(rows.slice(0,limit))};
  }
}

class FakeD1 {
  constructor(){ this.rows=new Map(); }
  prepare(sql){ return new FakeStatement(this,sql); }
}

function agent(overrides={}) {
  return {
    agent_id:'research-agent',
    name:'Research Agent',
    role:'Read evidence and prepare bounded reports.',
    capabilities:['memory.read','search.read'],
    permission_ceiling:PERMISSION_TIERS.READ,
    enabled:true,
    metadata:{purpose:'research'},
    ...overrides,
  };
}

test('D1 agent registry persists owner-scoped immutable descriptors across restart', async()=>{
  let now=1_000;
  const db=new FakeD1();
  const first=createAgentRegistry(createD1AgentRegistryAdapter(db,{now:()=>now}));

  const created=await first.register(agent(),{owner:'adrien'});
  assert.equal(created.owner,'adrien');
  assert.equal(created.agent_id,'research-agent');
  assert.deepEqual(created.capabilities,['memory.read','search.read']);

  const second=createAgentRegistry(createD1AgentRegistryAdapter(db,{now:()=>2_000}));
  const restored=await second.get({agent_id:'research-agent'},{owner:'adrien'});
  assert.deepEqual(restored,created);

  await assert.rejects(
    ()=>second.get({agent_id:'research-agent'},{owner:'other'}),
    {code:'AGENT_NOT_FOUND',status:404},
  );

  await assert.rejects(
    ()=>second.register(agent({name:'Replacement'}),{owner:'adrien'}),
    {code:'AGENT_EXISTS',status:409},
  );
});

test('D1 agent registry permits same agent id for different owners without leakage', async()=>{
  const db=new FakeD1();
  const registry=createAgentRegistry(createD1AgentRegistryAdapter(db));

  await registry.register(agent(),{owner:'adrien'});
  await registry.register(agent({name:'Other Owner Agent'}),{owner:'other'});

  assert.equal((await registry.list({}, {owner:'adrien'})).length,1);
  assert.equal((await registry.list({}, {owner:'other'})).length,1);
  assert.equal((await registry.get({agent_id:'research-agent'},{owner:'other'})).name,'Other Owner Agent');
});

test('D1 agent disable is durable and filtered listing reflects state', async()=>{
  let now=1_000;
  const db=new FakeD1();
  const registry=createAgentRegistry(createD1AgentRegistryAdapter(db,{now:()=>++now}));

  await registry.register(agent(),{owner:'adrien'});
  await registry.register(agent({agent_id:'writer-agent',name:'Writer',role:'Write drafts.'}),{owner:'adrien'});

  const disabled=await registry.disable({agent_id:'research-agent'},{owner:'adrien'});
  assert.equal(disabled.enabled,false);

  assert.deepEqual(
    (await registry.list({enabled:true},{owner:'adrien'})).map(row=>row.agent_id),
    ['writer-agent']
  );
  assert.deepEqual(
    (await registry.list({enabled:false},{owner:'adrien'})).map(row=>row.agent_id),
    ['research-agent']
  );
});

test('AgentAutomationGuard rejects capability and permission escalation before run claim', async()=>{
  const db=new FakeD1();
  const registry=createAgentRegistry(createD1AgentRegistryAdapter(db));
  await registry.register(agent(),{owner:'adrien'});

  const policy=createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  const guard=new AgentAutomationGuard({agentRegistry:registry,policy});

  await assert.rejects(
    ()=>guard.authorizeRun({
      run_id:'r1',
      idempotency_key:'i1',
      owner:'adrien',
      granted_capabilities:['memory.read','gmail.send'],
      granted_tier:PERMISSION_TIERS.SAFE_WRITE,
      requested_at:1_000,
      policy:{
        automation_id:'auto-1',
        agent_id:'research-agent',
        required_capabilities:['gmail.send'],
        permission_tier:PERMISSION_TIERS.SAFE_WRITE,
        enabled:true,
      },
    },{owner:'adrien'}),
    {code:'AUTOMATION_AGENT_CAPABILITY_DENIED',status:403},
  );

  await assert.rejects(
    ()=>guard.authorizeRun({
      run_id:'r2',
      idempotency_key:'i2',
      owner:'adrien',
      granted_capabilities:['memory.read'],
      granted_tier:PERMISSION_TIERS.SENSITIVE,
      requested_at:2_000,
      policy:{
        automation_id:'auto-2',
        agent_id:'research-agent',
        required_capabilities:['memory.read'],
        permission_tier:PERMISSION_TIERS.SENSITIVE,
        enabled:true,
      },
    },{owner:'adrien'}),
    {code:'AUTOMATION_AGENT_TIER_DENIED',status:403},
  );
});

test('AgentAutomationGuard authorizes within agent ceiling and enforces owner on terminal state', async()=>{
  const db=new FakeD1();
  const registry=createAgentRegistry(createD1AgentRegistryAdapter(db));
  await registry.register(agent(),{owner:'adrien'});

  const policy=createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter());
  const guard=new AgentAutomationGuard({agentRegistry:registry,policy});

  const authorized=await guard.authorizeRun({
    run_id:'r-ok',
    idempotency_key:'i-ok',
    owner:'spoofed-input-owner',
    granted_capabilities:['memory.read','search.read'],
    granted_tier:PERMISSION_TIERS.READ,
    requested_at:1_000,
    policy:{
      automation_id:'auto-read',
      agent_id:'research-agent',
      required_capabilities:['memory.read'],
      permission_tier:PERMISSION_TIERS.READ,
      enabled:true,
    },
  },{owner:'adrien'});

  assert.equal(authorized.claim.owner,'adrien');
  assert.equal(authorized.claim.agent_id,'research-agent');

  await assert.rejects(
    ()=>guard.completeRun({run_id:'r-ok',completed_at:2_000},{owner:'other'}),
    {code:'AUTOMATION_RUN_OWNER_MISMATCH',status:403},
  );

  const completed=await guard.completeRun({
    run_id:'r-ok',
    completed_at:2_000,
    result:{ok:true},
  },{owner:'adrien'});
  assert.equal(completed.status,'COMPLETED');
});

test('disabled agent cannot authorize new automation run', async()=>{
  const db=new FakeD1();
  const registry=createAgentRegistry(createD1AgentRegistryAdapter(db));
  await registry.register(agent(),{owner:'adrien'});
  await registry.disable({agent_id:'research-agent'},{owner:'adrien'});

  const guard=new AgentAutomationGuard({
    agentRegistry:registry,
    policy:createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter()),
  });

  await assert.rejects(
    ()=>guard.authorizeRun({
      run_id:'r-disabled',
      idempotency_key:'i-disabled',
      granted_capabilities:['memory.read'],
      granted_tier:PERMISSION_TIERS.READ,
      requested_at:1_000,
      policy:{
        automation_id:'auto-disabled',
        agent_id:'research-agent',
        required_capabilities:['memory.read'],
        permission_tier:PERMISSION_TIERS.READ,
        enabled:true,
      },
    },{owner:'adrien'}),
    {code:'AUTOMATION_AGENT_DISABLED',status:409},
  );
});
