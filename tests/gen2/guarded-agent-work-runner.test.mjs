import test from 'node:test';
import assert from 'node:assert/strict';

import { AgentAutomationGuard } from '../../src/agents/d1-agent-registry.js';
import { GuardedAgentWorkRunner } from '../../src/agents/guarded-work-runner.js';
import {
  PERMISSION_TIERS,
  RUN_STATUSES,
  createAgentAutomationPolicy,
  createInMemoryAgentAutomationPolicyAdapter,
} from '../../src/automations/agent-automation-policy.js';

function guardFor(agent) {
  return new AgentAutomationGuard({
    agentRegistry: {
      get: async ({ agent_id }, context) => {
        if (agent_id !== agent.agent_id || context.owner !== agent.owner) {
          throw Object.assign(new Error('AGENT_NOT_FOUND'), { code:'AGENT_NOT_FOUND', status:404 });
        }
        return structuredClone(agent);
      },
    },
    policy: createAgentAutomationPolicy(createInMemoryAgentAutomationPolicyAdapter()),
  });
}

function agent(overrides={}) {
  return {
    owner:'adrien',
    agent_id:'agent-1',
    enabled:true,
    capabilities:['memory.read'],
    permission_ceiling:PERMISSION_TIERS.READ,
    ...overrides,
  };
}

function request(overrides={}) {
  return {
    run_id:'run-1',
    idempotency_key:'idem-1',
    policy:{
      automation_id:'auto-1',
      agent_id:'agent-1',
      required_capabilities:['memory.read'],
      permission_tier:PERMISSION_TIERS.READ,
      enabled:true,
    },
    work:{
      id:'work-agent-1',
      goal:'Read memory once',
      nodes:[
        {
          id:'step-1',
          kind:'TASK',
          idempotent:true,
          payload:{capability:'memory.read',input:{key:'x'}},
        },
      ],
    },
    ...overrides,
  };
}

test('authorized agent creates/runs Work and completes durable run claim', async()=>{
  let now=1_000;
  const calls=[];
  const bus={
    execute:async(id,input,context)=>{
      calls.push({id,input,owner:context.owner});
      if(id==='work.create') return {id:input.id,status:'RUNNING',completed:false};
      if(id==='work.run') return {id:input.id,status:'COMPLETED',completed:true};
      throw new Error('unexpected capability');
    },
  };
  const runner=new GuardedAgentWorkRunner({
    guard:guardFor(agent()),
    bus,
    resolveGrants:async()=>({
      capabilities:['memory.read'],
      tier:PERMISSION_TIERS.READ,
      approved:false,
      provenance:{source:'server-policy'},
    }),
    now:()=>++now,
  });

  const result=await runner.execute(request(),{owner:'adrien',requestId:'req-1'});
  assert.equal(result.claim.status,RUN_STATUSES.COMPLETED);
  assert.equal(result.work.completed,true);
  assert.equal(result.terminal,true);
  assert.equal(result.grant_provenance.source,'server-policy');
  assert.deepEqual(calls.map(row=>row.id),['work.create','work.run']);
  assert.ok(calls.every(row=>row.owner==='adrien'));
});

test('agent capability denial occurs before any Work side effect', async()=>{
  let workCalls=0;
  const runner=new GuardedAgentWorkRunner({
    guard:guardFor(agent()),
    bus:{execute:async()=>{workCalls+=1; throw new Error('must not run');}},
    resolveGrants:async()=>({
      capabilities:['gmail.send'],
      tier:PERMISSION_TIERS.SAFE_WRITE,
      approved:false,
    }),
  });

  await assert.rejects(
    ()=>runner.execute(request({
      policy:{
        automation_id:'auto-mail',
        agent_id:'agent-1',
        required_capabilities:['gmail.send'],
        permission_tier:PERMISSION_TIERS.SAFE_WRITE,
        enabled:true,
      },
      work:{
        id:'mail-work',
        goal:'Send mail',
        nodes:[{id:'send',kind:'TASK',payload:{capability:'gmail.send',input:{}}}],
      },
    }),{owner:'adrien'}),
    {code:'AUTOMATION_AGENT_CAPABILITY_DENIED',status:403},
  );
  assert.equal(workCalls,0);
});

test('Work cannot call a capability omitted from the authorized agent policy', async()=>{
  let resolverCalls=0;
  let workCalls=0;
  const runner=new GuardedAgentWorkRunner({
    guard:guardFor(agent({capabilities:['memory.read','gmail.send']})),
    bus:{execute:async()=>{workCalls+=1;}},
    resolveGrants:async()=>{
      resolverCalls+=1;
      return {capabilities:['memory.read','gmail.send'],tier:PERMISSION_TIERS.SAFE_WRITE};
    },
  });

  await assert.rejects(
    ()=>runner.execute(request({
      work:{
        id:'undeclared',
        goal:'Attempt undeclared side effect',
        nodes:[{id:'send',kind:'TASK',payload:{capability:'gmail.send',input:{}}}],
      },
    }),{owner:'adrien'}),
    {code:'AGENT_WORK_CAPABILITY_UNDECLARED',status:403},
  );

  assert.equal(resolverCalls,0);
  assert.equal(workCalls,0);
});

test('destructive approval comes from server grant resolver, never request payload', async()=>{
  let workCalls=0;
  const destructiveAgent=agent({
    capabilities:['files.delete'],
    permission_ceiling:PERMISSION_TIERS.DESTRUCTIVE,
  });
  const runner=new GuardedAgentWorkRunner({
    guard:guardFor(destructiveAgent),
    bus:{execute:async()=>{workCalls+=1;}},
    resolveGrants:async()=>({
      capabilities:['files.delete'],
      tier:PERMISSION_TIERS.DESTRUCTIVE,
      approved:false,
      provenance:{approval:'server-denied'},
    }),
  });

  await assert.rejects(
    ()=>runner.execute({
      ...request({
        policy:{
          automation_id:'auto-delete',
          agent_id:'agent-1',
          required_capabilities:['files.delete'],
          permission_tier:PERMISSION_TIERS.DESTRUCTIVE,
          enabled:true,
        },
        work:{
          id:'delete-work',
          goal:'Delete explicitly approved file',
          nodes:[{id:'delete',kind:'TASK',payload:{capability:'files.delete',input:{path:'x'}}}],
        },
      }),
      approved:true,
      granted_tier:PERMISSION_TIERS.DESTRUCTIVE,
    },{owner:'adrien'}),
    {code:'AUTOMATION_EXPLICIT_APPROVAL_REQUIRED',status:403},
  );
  assert.equal(workCalls,0);
});

test('replaying a completed run is idempotent and does not recreate Work', async()=>{
  let now=1_000;
  const calls=[];
  const runner=new GuardedAgentWorkRunner({
    guard:guardFor(agent()),
    bus:{
      execute:async(id,input)=>{
        calls.push(id);
        if(id==='work.create') return {id:input.id,status:'RUNNING',completed:false};
        if(id==='work.run') return {id:input.id,status:'COMPLETED',completed:true};
        throw new Error('unexpected');
      },
    },
    resolveGrants:async()=>({
      capabilities:['memory.read'],
      tier:PERMISSION_TIERS.READ,
      approved:false,
    }),
    now:()=>++now,
  });

  const first=await runner.execute(request(),{owner:'adrien'});
  const second=await runner.execute(request(),{owner:'adrien'});

  assert.equal(first.claim.status,RUN_STATUSES.COMPLETED);
  assert.equal(second.claim.status,RUN_STATUSES.COMPLETED);
  assert.equal(second.deduplicated,true);
  assert.equal(second.executed,false);
  assert.equal(second.terminal,true);
  assert.deepEqual(calls,['work.create','work.run']);
});

test('Work failure marks the authorized automation run FAILED with root code', async()=>{
  let now=1_000;
  const guard=guardFor(agent());
  const runner=new GuardedAgentWorkRunner({
    guard,
    bus:{
      execute:async(id,input)=>{
        if(id==='work.create') return {id:input.id,status:'RUNNING',completed:false};
        if(id==='work.run') throw Object.assign(new Error('CHILD_TOOL_DOWN'),{code:'CHILD_TOOL_DOWN',retryable:true});
        throw new Error('unexpected');
      },
    },
    resolveGrants:async()=>({
      capabilities:['memory.read'],
      tier:PERMISSION_TIERS.READ,
      approved:false,
    }),
    now:()=>++now,
  });

  await assert.rejects(
    ()=>runner.execute(request(),{owner:'adrien'}),
    error=>error?.code==='CHILD_TOOL_DOWN',
  );

  const replay=await runner.execute(request(),{owner:'adrien'});
  assert.equal(replay.claim.status,RUN_STATUSES.FAILED);
  assert.equal(replay.terminal,true);
  assert.equal(replay.executed,false);
});
