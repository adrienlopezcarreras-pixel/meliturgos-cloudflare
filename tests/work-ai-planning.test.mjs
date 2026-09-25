import test from 'node:test';
import assert from 'node:assert/strict';
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
