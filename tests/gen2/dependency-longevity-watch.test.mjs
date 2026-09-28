import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDependencyLongevity,
  runDependencyLongevityWatch,
  emergencyFailoverRequestFromLongevity,
  emergencyFailoverRequestFromRegistry,
} from '../../src/evaluation/dependency-longevity-watch.js';

const dep={id:'runtime.primary',layer:'runtime',provider:'cloudflare-workers',criticality:'CRITICAL'};
const now=Date.UTC(2026,8,28,18,0,0);

test('service EOL inside 24h becomes an unattended emergency candidate when an alternative is prevalidated',()=>{
  const result=classifyDependencyLongevity(dep,{
    reachable:true,
    eol_at:new Date(now+12*3600000).toISOString(),
    replacement_candidates:[{id:'runtime.alt',prevalidated:true,score:0.92}],
    sources:[{title:'Official EOL notice',url:'https://example.com/eol'}],
  },{now});
  assert.equal(result.severity,'EMERGENCY');
  assert.equal(result.action,'FAILOVER_NOW');
  assert.equal(result.trigger_code,'SERVICE_EOL_IMMINENT');
  assert.equal(result.unattended_emergency_possible,true);

  const request=emergencyFailoverRequestFromLongevity(result,{ownerReachable:false});
  assert.equal(request.layer,'runtime');
  assert.equal(request.trigger.ownerReachable,false);
  assert.deepEqual(request.approvedAlternatives.map(x=>x.id),['runtime.alt']);
});

test('service EOL inside 30 days prepares migration before it becomes an emergency',()=>{
  const result=classifyDependencyLongevity(dep,{
    eol_at:new Date(now+10*24*3600000).toISOString(),
    replacement_candidates:[{id:'runtime.alt',prevalidated:false}],
  },{now});
  assert.equal(result.severity,'MIGRATION_REQUIRED');
  assert.equal(result.action,'PREPARE_AND_TEST_REPLACEMENT');
  assert.equal(result.unattended_emergency_possible,false);
});

test('loss of free tier triggers alternative benchmark without pretending service is dead',()=>{
  const result=classifyDependencyLongevity({
    id:'ai.primary',layer:'ai',provider:'provider',criticality:'CRITICAL',
  },{
    free_tier_lost:true,
    reachable:true,
    replacement_candidates:[{id:'ai.alt',prevalidated:false}],
  },{now});
  assert.equal(result.severity,'REVIEW');
  assert.equal(result.action,'BENCHMARK_ALTERNATIVES');
  assert.equal(result.trigger_code,null);
});

test('critical outage becomes immediate failover trigger',()=>{
  const result=classifyDependencyLongevity(dep,{
    reachable:false,
    replacement_candidates:[{id:'runtime.alt',prevalidated:true}],
  },{now});
  assert.equal(result.severity,'EMERGENCY');
  assert.equal(result.trigger_code,'SERVICE_UNREACHABLE_CRITICAL');
});

test('watch isolates inspector failures and never reports them healthy',async()=>{
  const report=await runDependencyLongevityWatch({
    dependencies:[
      dep,
      {id:'source-control.primary',layer:'source_control',provider:'github',criticality:'CRITICAL'},
    ],
    now,
    inspect:async row=>{
      if(row.layer==='runtime')throw new Error('web research unavailable');
      return {reachable:true};
    },
  });
  assert.equal(report.dependency_count,2);
  assert.equal(report.unknown_count,1);
  assert.equal(report.results.find(x=>x.dependency.layer==='runtime').severity,'UNKNOWN');
  assert.equal(report.results.find(x=>x.dependency.layer==='source_control').severity,'HEALTHY');
});

test('breaking API change forces migration preparation',()=>{
  const result=classifyDependencyLongevity(dep,{
    reachable:true,
    api_breaking_change:true,
  },{now});
  assert.equal(result.severity,'MIGRATION_REQUIRED');
  assert.equal(result.action,'PREPARE_AND_TEST_REPLACEMENT');
  assert.equal(result.trigger_code,'MIGRATION_DEADLINE_IMMINENT');
});


test('emergency registry request excludes expired and paid alternatives under zero-cost policy',()=>{
  const registry={
    layers:{
      runtime:[
        {
          id:'runtime.free',
          provider:'free-alt',
          adapter_id:'runtime.free',
          prevalidated:true,
          added_cost_eur:0,
          proof:{
            verified_at:new Date(now-3600000).toISOString(),
            expires_at:new Date(now+3600000).toISOString(),
          },
        },
        {
          id:'runtime.paid',
          provider:'paid-alt',
          adapter_id:'runtime.paid',
          prevalidated:true,
          added_cost_eur:9,
          proof:{
            verified_at:new Date(now-3600000).toISOString(),
            expires_at:new Date(now+3600000).toISOString(),
          },
        },
        {
          id:'runtime.expired',
          provider:'expired-alt',
          adapter_id:'runtime.expired',
          prevalidated:true,
          added_cost_eur:0,
          proof:{
            verified_at:new Date(now-7200000).toISOString(),
            expires_at:new Date(now-1).toISOString(),
          },
        },
      ],
    },
  };
  const result=classifyDependencyLongevity(dep,{
    reachable:false,
  },{now});
  const request=emergencyFailoverRequestFromRegistry(result,{
    registry,
    ownerReachable:false,
    maxAddedCostEur:0,
    now,
  });
  assert.deepEqual(request.approvedAlternatives.map(x=>x.id),['runtime.free']);
  assert.equal(request.trigger.ownerReachable,false);
});
