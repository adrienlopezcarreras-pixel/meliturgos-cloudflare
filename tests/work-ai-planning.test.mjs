import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { registerWorkCapabilities } from '../src/capabilities/work-capabilities.js';
import {
  buildPlanningCatalog,
  buildWorkPlanningPrompt,
  parseCapabilityAwareWorkPlan,
} from '../src/work/ai-planning-engine.js';

const capabilities = [
  {
    id:'echo', name:'Echo', description:'Return a value', risk:'LOW', enabled:true, health:'HEALTHY',
    input_schema:{type:'object',properties:{value:{type:'string',minLength:0,maxLength:1000}},required:['value'],additionalProperties:false},
  },
  {
    id:'danger.write', name:'Write', description:'Mutating action', risk:'HIGH', enabled:true, health:'HEALTHY',
    approval:{required:true,scope:'danger.write',reason:'test'},
    input_schema:{type:'object',properties:{value:{type:'string',minLength:1,maxLength:100}},required:['value'],additionalProperties:false},
  },
  {
    id:'work.run', name:'Recursive', description:'Must be excluded', risk:'MEDIUM', enabled:true, health:'HEALTHY',
    input_schema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},
  },
  {
    id:'offline.tool', name:'Offline', description:'Unavailable', risk:'LOW', enabled:true, health:'UNAVAILABLE',
    input_schema:{type:'object',properties:{},additionalProperties:false},
  },
];

test('GEN2-38 AI planner catalog exposes only executable non-work capabilities', () => {
  const catalog=buildPlanningCatalog(capabilities);
  assert.deepEqual(catalog.map(row=>row.id),['danger.write','echo']);
  const prompt=buildWorkPlanningPrompt({goal:'Faire deux étapes',constraints:['zéro dépense'],catalog});
  assert.match(prompt,/AVAILABLE_CAPABILITIES/);
  assert.match(prompt,/danger\.write/);
  assert.doesNotMatch(prompt,/work\.run/);
  assert.ok(prompt.length<=12000);
});

test('GEN2-38 AI planner accepts schema-valid model JSON and clamps unsafe idempotence', () => {
  const catalog=buildPlanningCatalog(capabilities);
  const result=parseCapabilityAwareWorkPlan({
    id:'generated-plan',
    goal:'Planifier une action',
    catalog,
    text:JSON.stringify({
      steps:[
        {id:'a',title:'Diagnostic',capability:'echo',input:{value:'ok'},dependsOn:[],idempotent:true},
        {id:'b',title:'Mutation',capability:'danger.write',input:{value:'x'},dependsOn:['a'],idempotent:true},
      ],
      constraints:['confirmation requise'],
    }),
  });
  assert.equal(result.plan.steps[0].idempotent,true);
  assert.equal(result.plan.steps[1].idempotent,false);
  assert.equal(result.plan.steps[1].depends_on[0],'a');
  assert.equal(result.plan.constraints.includes('confirmation requise'),true);
});

test('GEN2-38 AI planner fails closed on invented capabilities or invalid capability input', () => {
  const catalog=buildPlanningCatalog(capabilities);
  assert.throws(()=>parseCapabilityAwareWorkPlan({
    goal:'Invented',
    catalog,
    text:'{"steps":[{"id":"x","capability":"imaginary.tool","input":{}}]}',
  }),error=>error.code==='WORK_PLAN_MODEL_CAPABILITY_INVALID');

  assert.throws(()=>parseCapabilityAwareWorkPlan({
    goal:'Bad schema',
    catalog,
    text:'{"steps":[{"id":"x","capability":"echo","input":{"unknown":true}}]}',
  }),error=>error.code==='WORK_PLAN_MODEL_INPUT_SCHEMA_INVALID');
});


test('work.plan.generate uses multi-AI output but returns only a validated non-executed plan', async () => {
  const bus=new CapabilityBus();
  bus.discover({
    id:'echo',name:'Echo',category:'test',version:'1.0.0',provider:'fixture',
    description:'Echo fixture capability',
    input_schema:{type:'object',properties:{value:{type:'string',minLength:1,maxLength:100}},required:['value'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>({value:input.value}));
  bus.discover({
    id:'augmentio.fanout',name:'Fixture multi-AI',category:'test',version:'1.0.0',provider:'fixture',
    description:'Returns one deterministic planning proposal',
    input_schema:{
      type:'object',
      properties:{
        capability:{type:'string',minLength:1,maxLength:100},
        input:{type:'string',minLength:1,maxLength:12000},
        context:{type:'object',additionalProperties:true},
        maxCandidates:{type:'integer',minimum:1,maximum:12},
      },
      required:['input'],additionalProperties:false,
    },
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async ()=>({
    best:{
      provider:'fixture',
      model:'planner-bad',
      text:'{"steps":[{"id":"bad","capability":"invented.tool","input":{}}]}',
    },
    candidates:[
      {
        provider:'fixture',
        model:'planner-bad',
        text:'{"steps":[{"id":"bad","capability":"invented.tool","input":{}}]}',
      },
      {
        provider:'fixture',
        model:'planner-1',
        text:JSON.stringify({steps:[
          {id:'only',title:'Echo goal',capability:'echo',input:{value:'planned'},dependsOn:[],idempotent:true},
        ]}),
      },
    ],
    failures:0,
  }));
  registerWorkCapabilities(bus,{});

  const result=await bus.execute('work.plan.generate',{
    id:'auto-plan',
    goal:'Créer un plan simple',
    maxCandidates:1,
  },{owner:'adrien',requestId:'auto-plan-test',permissions:[]});

  assert.equal(result.plan.id,'auto-plan');
  assert.equal(result.plan.steps[0].capability,'echo');
  assert.equal(result.generator.execution_started,false);
  assert.equal(result.generator.persisted,false);
  assert.equal(result.generator.provider,'fixture');
  assert.equal(result.generator.model,'planner-1');
  assert.equal(result.generator.rejected_candidates.length,1);
});


test('work.plan.generate retries once with a strict zero-cost repair prompt when all first-pass candidates are invalid', async () => {
  const bus=new CapabilityBus();
  let fanoutCalls=0;
  bus.discover({
    id:'echo',name:'Echo',category:'test',version:'1.0.0',provider:'fixture',
    description:'Echo fixture capability',
    input_schema:{type:'object',properties:{value:{type:'string',minLength:1,maxLength:100}},required:['value'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>({value:input.value}));
  bus.discover({
    id:'augmentio.fanout',name:'Fixture multi-AI',category:'test',version:'1.0.0',provider:'fixture',
    description:'Returns an invalid proposal, then a repaired valid proposal',
    input_schema:{
      type:'object',
      properties:{
        capability:{type:'string',minLength:1,maxLength:100},
        input:{type:'string',minLength:1,maxLength:12000},
        context:{type:'object',additionalProperties:true},
        maxCandidates:{type:'integer',minimum:1,maximum:12},
      },
      required:['input'],additionalProperties:false,
    },
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>{
    fanoutCalls+=1;
    if(fanoutCalls===1){
      return {
        candidates:[{provider:'fixture',model:'planner-bad',text:'{"steps":[{"id":"bad","capability":"invented.tool","input":{}}]}'}],
        failures:0,
      };
    }
    assert.equal(input.context.purpose,'work-plan-generation-repair');
    assert.match(input.input,/REPAIR_CAPABILITIES/);
    return {
      candidates:[{provider:'fixture',model:'planner-fixed',text:JSON.stringify({steps:[
        {id:'only',title:'Echo goal',capability:'echo',input:{value:'planned'},dependsOn:[],idempotent:true},
      ]})}],
      failures:0,
    };
  });
  registerWorkCapabilities(bus,{});

  const result=await bus.execute('work.plan.generate',{
    id:'auto-plan-repair',
    goal:'Créer un plan simple',
    maxCandidates:1,
  },{owner:'adrien',requestId:'auto-plan-repair-test',permissions:[]});

  assert.equal(fanoutCalls,2);
  assert.equal(result.plan.steps[0].capability,'echo');
  assert.equal(result.generator.repair_attempted,true);
  assert.equal(result.generator.candidate_count,2);
  assert.equal(result.generator.rejected_candidates.length,1);
  assert.equal(result.generator.model,'planner-fixed');
  assert.equal(result.generator.execution_started,false);
  assert.equal(result.generator.persisted,false);
});


test('work.plan.generate repair prompt constrains the model to a small low-risk catalog', async () => {
  const bus=new CapabilityBus();
  let calls=0;
  bus.discover({
    id:'echo',name:'Echo',category:'test',version:'1.0.0',provider:'fixture',
    description:'Echo fixture capability',
    input_schema:{type:'object',properties:{value:{type:'string',minLength:1,maxLength:100}},required:['value'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>({value:input.value}));
  bus.discover({
    id:'danger.write',name:'Write',category:'test',version:'1.0.0',provider:'fixture',
    description:'Mutating fixture capability',
    input_schema:{type:'object',properties:{value:{type:'string',minLength:1,maxLength:100}},required:['value'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'HIGH',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>({value:input.value}));
  bus.discover({
    id:'augmentio.fanout',name:'Fixture multi-AI',category:'test',version:'1.0.0',provider:'fixture',
    description:'Returns invalid then valid repair',
    input_schema:{
      type:'object',
      properties:{
        capability:{type:'string',minLength:1,maxLength:100},
        input:{type:'string',minLength:1,maxLength:12000},
        context:{type:'object',additionalProperties:true},
        maxCandidates:{type:'integer',minimum:1,maximum:12},
      },
      required:['input'],additionalProperties:false,
    },
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async input=>{
    calls+=1;
    if(calls===1){
      return {candidates:[{provider:'fixture',model:'bad',text:'{"steps":[{"capability":"invented.tool","input":{}}]}'}],failures:0};
    }
    assert.equal(input.context.purpose,'work-plan-generation-repair');
    assert.match(input.input,/REPAIR_CAPABILITIES/);
    assert.match(input.input,/"id":"echo"/);
    assert.doesNotMatch(input.input,/"id":"danger.write"/);
    assert.doesNotMatch(input.input,/"id":"augmentio.fanout"/);
    return {candidates:[{provider:'fixture',model:'fixed',text:'{"steps":[{"id":"step-1","title":"Echo","capability":"echo","input":{"value":"ok"},"dependsOn":[],"idempotent":true}],"constraints":[]}'}],failures:0};
  });
  registerWorkCapabilities(bus,{});
  const result=await bus.execute('work.plan.generate',{goal:'diagnostic simple',maxCandidates:1},{owner:'adrien',requestId:'constrained-repair-test',permissions:[]});
  assert.equal(result.generator.repair_attempted,true);
  assert.equal(result.generator.model,'fixed');
  assert.equal(result.plan.steps[0].capability,'echo');
});


test('work.plan.generate falls back to AI capability selection and synthesizes schema-valid input', async () => {
  const calls = [];
  const bus = new CapabilityBus();
  bus.discover({
    id:'augmentio.fanout', name:'Fixture multi-AI', category:'test', version:'1.0.0', provider:'fixture',
    description:'Returns invalid free-form plans first, then a deterministic capability selection.',
    input_schema:{type:'object',properties:{capability:{type:'string'},input:{type:'string'},context:{type:'object',additionalProperties:true},maxCandidates:{type:'integer'}},required:['input'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW', permissions:[], health:'HEALTHY', enabled:true,
  }, async (input) => {
    calls.push(input);
    if (calls.length === 1) return {candidates:[{provider:'fixture',model:'bad-1',text:'{"steps":[{"capability":"invented.cap","input":{}}]}'}],failures:0};
    if (calls.length === 2) return {candidates:[{provider:'fixture',model:'bad-2',text:'not-json'}],failures:0};
    return {candidates:[{provider:'fixture',model:'selector',text:'echo'}],failures:0};
  });
  bus.discover({
    id:'echo', name:'Echo', category:'test', version:'1.0.0', provider:'fixture',
    description:'Echo fixture capability for structured selection fallback.',
    input_schema:{type:'object',properties:{value:{type:'string',minLength:1,maxLength:100}},required:['value'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW', permissions:[], health:'HEALTHY', enabled:true,
  }, async (input) => input);
  registerWorkCapabilities(bus,{});
  const result = await bus.execute('work.plan.generate',{goal:'diagnostic simple',maxCandidates:1},{owner:'adrien',requestId:'structured-selection-test',permissions:[]});
  assert.equal(result.ok,true);
  assert.equal(result.plan.steps[0].capability,'echo');
  assert.equal(typeof result.plan.steps[0].input.value,'string');
  assert.ok(result.plan.steps[0].input.value.length >= 1);
  assert.equal(result.generator.model,'selector');
  assert.equal(result.generator.execution_started,false);
  assert.equal(result.generator.persisted,false);
  assert.equal(calls[2].context.purpose,'work-plan-generation-capability-selection');
  assert.match(calls[2].input,/IDS_AUTORISES:/);
  assert.match(calls[2].input,/echo/);
});


test('work.plan.generate health follows the real Augmentio fanout readiness',async()=>{
  const healthyBus=new CapabilityBus();
  healthyBus.discover({
    id:'augmentio.fanout',name:'Fixture fanout',category:'test',version:'1.0.0',provider:'fixture',
    description:'healthy fixture',
    input_schema:{type:'object',properties:{input:{type:'string'}},required:['input'],additionalProperties:true},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  },async()=>({candidates:[],failures:0}));
  registerWorkCapabilities(healthyBus,{});
  const healthy=await healthyBus.refreshHealth('work.plan.generate');
  assert.equal(healthy.health,'HEALTHY');
  assert.equal(healthy.health_detail,undefined);

  const unavailableBus=new CapabilityBus();
  unavailableBus.discover({
    id:'augmentio.fanout',name:'Fixture fanout',category:'test',version:'1.0.0',provider:'fixture',
    description:'unavailable fixture',
    input_schema:{type:'object',properties:{input:{type:'string'}},required:['input'],additionalProperties:true},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'UNAVAILABLE',enabled:true,
  },async()=>({candidates:[],failures:0}));
  registerWorkCapabilities(unavailableBus,{});
  const degraded=await unavailableBus.refreshHealth('work.plan.generate');
  assert.equal(degraded.health,'DEGRADED');
  assert.equal(degraded.health_detail,'AUGMENTIO_FANOUT_UNAVAILABLE');
});

test('GEN2-38 fails fast when zero-cost providers return no candidates instead of retrying empty fan-outs', async () => {
  const bus = new CapabilityBus();
  let fanoutCalls = 0;
  bus.discover({
    id:'echo',name:'Echo',category:'test',version:'1.0.0',provider:'fixture',
    description:'Safe echo capability',
    input_schema:{type:'object',properties:{value:{type:'string',minLength:1,maxLength:100}},required:['value'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  }, async input => ({value:input.value}));
  bus.discover({
    id:'augmentio.fanout',name:'Fixture multi-AI',category:'test',version:'1.0.0',provider:'fixture',
    description:'No available providers fixture',
    input_schema:{type:'object',properties:{capability:{type:'string',minLength:1,maxLength:100},input:{type:'string',minLength:1,maxLength:12000},context:{type:'object',additionalProperties:true},maxCandidates:{type:'integer',minimum:1,maximum:12}},required:['input'],additionalProperties:false},
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',permissions:[],health:'HEALTHY',enabled:true,
  }, async () => { fanoutCalls += 1; return {candidates:[],failures:2}; });
  registerWorkCapabilities(bus,{});
  await assert.rejects(
    () => bus.execute('work.plan.generate',{goal:'Create a safe read-only diagnostic plan',maxCandidates:2},{owner:'release-proof',requestId:'gen2-38-provider-outage',permissions:[]}),
    error => error.code === 'WORK_PLAN_GENERATION_PROVIDERS_UNAVAILABLE',
  );
  assert.equal(fanoutCalls,1,'provider outage must not trigger repair and capability-selection fan-outs');
});

test('GEN2-38 applies a bounded no-retry scheduler only to work-plan fan-outs', async () => {
  const defaultBus = await readFile(new URL('../src/capabilities/default-bus.js', import.meta.url), 'utf8');
  assert.match(defaultBus, /purpose = String\(input\.context\?\.purpose \|\| ''\)/);
  assert.match(defaultBus, /purpose === 'work-plan-generation'/);
  assert.match(defaultBus, /purpose\.startsWith\('work-plan-generation-'\)/);
  assert.match(defaultBus, /new ParallelScheduler\(/);
  assert.match(defaultBus, /timeoutMs: 24_000/);
  assert.match(defaultBus, /retries: 0/);
  assert.match(defaultBus, /backoffMs: 0/);
  assert.match(defaultBus, /Other Augmentio callers retain their established scheduler defaults/);
});

test('GEN2-38 release smoke keeps real planner bounded and surfaces curl transport failures', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/capabilities/work-capabilities.js', import.meta.url), 'utf8');
  const start = workflow.indexOf('GEN_PLAN_CODE="$(curl');
  const end = workflow.indexOf('if [ "$GEN_PLAN_CODE" != "200" ]', start);
  assert.ok(start >= 0 && end > start, 'GEN2-38 generated-plan request should remain in the release gate');
  const block = workflow.slice(start, end);
  assert.match(block, /maxCandidates":2/);
  assert.doesNotMatch(block, /--retry 1 --retry-all-errors/);
  assert.match(block, /\|\| true/);
  assert.match(workflow.slice(end, end + 500), /GEN2-38 generated plan returned HTTP/);
  assert.match(source, /const planningDeadline = Date\.now\(\) \+ 105_000/);
  assert.match(source, /WORK_PLAN_GENERATION_BUDGET_EXHAUSTED/);
  assert.match(source, /Promise\.race\(/, 'all planner fan-outs share a cumulative deadline');
  assert.equal((source.match(/executeBoundedPlanningFanout\(/g) || []).length, 3,
    'initial generation, repair and capability selection share one deadline');
});

test('GEN2-38 release diagnostic creates a bounded local plan without waiting on AI providers', async () => {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'echo', name: 'Echo', category: 'diagnostic', version: '1.0.0', provider: 'fixture',
    description: 'No-side-effect diagnostic echo',
    input_schema: {
      type: 'object',
      properties: { value: { type: 'string', minLength: 1, maxLength: 1000 } },
      required: ['value'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async input => ({ value: input.value }));
  // Fill the normal goal-ranked catalog ahead of echo. Release smoke must still
  // find the real safe diagnostic capability instead of failing due to truncation.
  for (let index = 0; index < 30; index += 1) {
    const suffix = String(index).padStart(2, '0');
    bus.discover({
      id: 'diagnostic.safe-read-' + suffix,
      name: 'Safe read-only diagnostic plan capability ' + suffix,
      category: 'diagnostic',
      version: '1.0.0',
      provider: 'fixture',
      description: 'Produce a one-step safe read-only diagnostic plan using an actually available capability. '.repeat(3),
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
      output_schema: { type: 'object', additionalProperties: true },
      risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
    }, async () => ({ ok: true }));
  }
  let fanoutCalls = 0;
  bus.discover({
    id: 'augmentio.fanout', name: 'Fixture multi-AI', category: 'test', version: '1.0.0', provider: 'fixture',
    description: 'Must not be called for the bounded release diagnostic',
    input_schema: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => { fanoutCalls += 1; throw new Error('AI fanout must not run'); });
  registerWorkCapabilities(bus, {});

  const result = await bus.execute('work.plan.generate', {
    id: 'release-gen2-38',
    goal: 'Produce a one-step safe read-only diagnostic plan using only an actually available capability.',
    constraints: ['No side effects', 'Use only listed capabilities'],
    maxCandidates: 2,
  }, { owner: 'adrien', requestId: 'release-gen2-38-test', permissions: [], releaseSmoke: true });

  assert.equal(fanoutCalls, 0);
  assert.equal(result.plan.steps.length, 1);
  assert.equal(result.plan.steps[0].capability, 'echo');
  assert.equal(result.generator.provider, 'local');
  assert.equal(result.generator.model, 'bounded-diagnostic-fallback');
  assert.equal(result.generator.execution_started, false);
  assert.equal(result.generator.persisted, false);
});

test('GEN2-38 release diagnostic fails explicitly when the safe echo capability is absent', async () => {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'other.read', name: 'Other read', category: 'diagnostic', version: '1.0.0', provider: 'fixture',
    description: 'A different read-only capability, not the required echo capability',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => ({ ok: true }));
  let fanoutCalls = 0;
  bus.discover({
    id: 'augmentio.fanout', name: 'Fixture multi-AI', category: 'test', version: '1.0.0', provider: 'fixture',
    description: 'Must not bypass a missing required release diagnostic capability',
    input_schema: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => { fanoutCalls += 1; return { candidates: [], failures: 2 }; });
  registerWorkCapabilities(bus, {});
  await assert.rejects(
    () => bus.execute('work.plan.generate', {
      id: 'release-gen2-38-missing-echo',
      goal: 'Produce a one-step safe read-only diagnostic plan using only an actually available capability.',
      constraints: ['No side effects', 'Use only listed capabilities'],
      maxCandidates: 2,
    }, { owner: 'adrien', requestId: 'release-gen2-38-missing-echo-test', permissions: [], releaseSmoke: true }),
    error => error.code === 'WORK_PLAN_RELEASE_DIAGNOSTIC_ECHO_UNAVAILABLE',
  );
  assert.equal(fanoutCalls, 0);
});

test('GEN2-38 does not use the local release fallback for similar user-authored goals', async () => {
  for (const goal of ['Diagnostique ma release', 'Fais un plan de test']) {
    const bus = new CapabilityBus();
    bus.discover({
      id: 'echo', name: 'Echo', category: 'diagnostic', version: '1.0.0', provider: 'fixture',
      description: 'No-side-effect diagnostic echo',
      input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
      output_schema: { type: 'object', additionalProperties: true },
      risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
    }, async input => ({ value: input.value }));
    let fanoutCalls = 0;
    bus.discover({
      id: 'augmentio.fanout', name: 'Fixture multi-AI', category: 'test', version: '1.0.0', provider: 'fixture',
      description: 'Valid generated plan fixture',
      input_schema: { type: 'object', properties: { capability: { type: 'string' }, input: { type: 'string' }, context: { type: 'object', additionalProperties: true }, maxCandidates: { type: 'integer' } }, required: ['capability', 'input', 'context', 'maxCandidates'], additionalProperties: false },
      output_schema: { type: 'object', additionalProperties: true },
      risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
    }, async () => {
      fanoutCalls += 1;
      return { candidates: [{
        provider: 'fixture',
        model: 'fixture-planner',
        text: JSON.stringify({ steps: [{ id: 'step-1', title: 'Echo diagnostic', capability: 'echo', input: { value: 'ok' }, dependsOn: [], idempotent: true }] }),
      }], failures: 0 };
    });
    registerWorkCapabilities(bus, {});
    const result = await bus.execute('work.plan.generate', {
      id: 'user-authored-plan',
      goal,
      constraints: ['No side effects'],
      maxCandidates: 1,
    }, { owner: 'adrien', requestId: 'user-authored-plan-test', permissions: [], releaseSmoke: true });
    assert.equal(fanoutCalls, 1, goal + ' must use the normal provider path');
    assert.equal(result.generator.model, 'fixture-planner');
    assert.notEqual(result.generator.model, 'bounded-diagnostic-fallback');
    assert.equal(result.generator.execution_started, false);
    assert.equal(result.generator.persisted, false);
  }
});

test('GEN2-38 provider outage remains visible for non-canonical planning goals', async () => {
  const bus = new CapabilityBus();
  bus.discover({
    id: 'echo', name: 'Echo', category: 'diagnostic', version: '1.0.0', provider: 'fixture',
    description: 'No-side-effect diagnostic echo',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async input => ({ value: input.value }));
  let fanoutCalls = 0;
  bus.discover({
    id: 'augmentio.fanout', name: 'Fixture multi-AI', category: 'test', version: '1.0.0', provider: 'fixture',
    description: 'Provider outage fixture',
    input_schema: { type: 'object', properties: { capability: { type: 'string' }, input: { type: 'string' }, context: { type: 'object', additionalProperties: true }, maxCandidates: { type: 'integer' } }, required: ['capability', 'input', 'context', 'maxCandidates'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => { fanoutCalls += 1; return { candidates: [], failures: 2 }; });
  registerWorkCapabilities(bus, {});
  await assert.rejects(
    () => bus.execute('work.plan.generate', {
      goal: 'Diagnostique ma release',
      constraints: ['No side effects'],
      maxCandidates: 1,
    }, { owner: 'adrien', requestId: 'gen2-38-user-provider-outage', permissions: [], releaseSmoke: true }),
    error => error.code === 'WORK_PLAN_GENERATION_PROVIDERS_UNAVAILABLE',
  );
  assert.equal(fanoutCalls, 1);
});
