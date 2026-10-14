import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

test('local LoRA quality gate accepts only complete nonregressing cases, never promotes',()=>{
 const py=`
import runpy,copy
v=runpy.run_path('scripts/check-lora-local-quality-gate.py',run_name='fixture')['verify']
base=[
 {'id':'boundary','kind':'dangerous_boundary','domain':'targeted_boundary','score':0.75,'error':None,'metrics':{'refused':True}},
 {'id':'agent','kind':'agentic','domain':'agentic_execution','score':0.90,'error':None,'metrics':{'agentic_execution':True}},
]
base += [{'id':f'safe-{i}','kind':'legitimate_sensitive','domain':'technical_depth','score':0.8,'error':None,'metrics':{'refused':False}} for i in range(4)]
impact={'case_count':6,'local_uncensored_gate':True,
 'baseline':{'cases':copy.deepcopy(base),'metrics':{'agentic_execution':0.9}},
 'candidate':{'cases':copy.deepcopy(base),'metrics':{'uncensored_gate':True,'agentic_execution':0.9}}}
run={'local_uncensored_gate':True}
r=v(run,impact)
assert r['activated'] is False and r['promoted'] is False
def fails(expected,fn):
 test=copy.deepcopy(impact)
 fn(test)
 try:
  v(run,test)
  raise AssertionError('wrongly approved '+expected)
 except ValueError as e:
  assert expected in str(e),str(e)
fails('BOUNDARY_SAFETY_REGRESSION',lambda p:p['candidate']['cases'][0]['metrics'].update(refused=False))
fails('AGENTIC_EXECUTION_REGRESSION',lambda p:p['candidate']['cases'][1].update(score=0.5))
fails('AGENTIC_AGGREGATE_REGRESSION',lambda p:p['candidate']['metrics'].update(agentic_execution=0.5))
fails('CASE_COVERAGE_INVALID',lambda p:p['candidate']['cases'].pop())
fails('CASE_IDENTITIES_INVALID',lambda p:p['candidate']['cases'][1].update(id='boundary'))
fails('CASE_DOMAIN_CHANGED',lambda p:p['candidate']['cases'][1].update(domain='other'))
fails('UNAPPROVED_LOCAL_GATE',lambda p:p.update(local_uncensored_gate=False))
print('LOCAL_LORA_QUALITY_GUARD_POSITIVE_AND_NEGATIVE_FIXTURES_PASS')
`;
 const result=spawnSync('python3',['-c',py],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/LOCAL_LORA_QUALITY_GUARD_POSITIVE_AND_NEGATIVE_FIXTURES_PASS/);
});
test('local safety regression guard precedes LoRA Cloudflare mutation',()=>{
 const yaml=readFileSync('.github/workflows/lora-kaggle-free-gpu.yml','utf8');
 const quality=yaml.indexOf('- name: Require no safety or agentic regression before Cloudflare preview mutation');
 const gate=yaml.indexOf('- name: Require local quality gate before Cloudflare preview mutation');
 const upload=yaml.indexOf('- name: Upload adapter to Cloudflare open-beta LoRA');
 const approve=yaml.indexOf('approve-lora-artifact.mjs',upload);
 assert.ok(quality>0 && gate>quality && upload>gate && approve>upload);
 assert.match(yaml.slice(quality,gate),/check-lora-local-quality-gate\.py/);
 assert.match(yaml.slice(quality,gate),/BENCHMARK_PREVIEW == 'true'/);
});
