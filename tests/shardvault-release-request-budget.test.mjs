import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Execute the canonical shell phase with a controlled transport and clock.
// No live provider, external write or production success is simulated as proof.
const script=await readFile(new URL('../scripts/release-autonomy-deep-proof.sh',import.meta.url),'utf8');
const start=script.indexOf('if [ "$SHARD_ACTIVE" -lt "$SHARD_RELEASE_QUORUM" ]; then');
const end=script.indexOf('\nSHARD_FINAL_READY=0',start);
assert.ok(start>=0&&end>start);
async function run({seconds,counts=[5]}){
 const dir=await mkdtemp(join(tmpdir(),'mel-shard-budget-'));
 try{
  await writeFile(join(dir,'clock'),'0');
  await writeFile(join(dir,'date'),'#!'+process.execPath+'\n'+`const fs=require('fs');process.stdout.write(fs.readFileSync(process.env.FIXTURE_DIR+'/clock','utf8'));\n`,{mode:0o755});
  await writeFile(join(dir,'sleep'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  await writeFile(join(dir,'curl'),'#!'+process.execPath+'\n'+`
   const fs=require('fs'),d=process.env.FIXTURE_DIR,args=process.argv.slice(2);
   const arg=name=>args[args.indexOf(name)+1],limit=Number(arg('--max-time'));
   const log=d+'/calls',calls=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\\n').filter(Boolean):[];
   const seconds=Number(process.env.PROVIDER_SECONDS),counts=JSON.parse(process.env.ACTIVE_COUNTS);
   const timedOut=seconds>limit;
   fs.appendFileSync(log,JSON.stringify({limit,payload:JSON.parse(arg('--data')),seconds:Math.min(seconds,limit)})+'\\n');
   fs.writeFileSync(d+'/clock',String(Number(fs.readFileSync(d+'/clock','utf8'))+Math.min(seconds,limit)));
   fs.writeFileSync(arg('--output'),JSON.stringify({ok:true,active_external_count:counts[Math.min(calls.length,counts.length-1)],target_count:7}));
   process.stdout.write(timedOut?'000':'200');if(timedOut)process.exitCode=28;
  `,{mode:0o755});
  const phase='set -euo pipefail\nSHARD_ACTIVE=4\nSHARD_RELEASE_QUORUM=5\nBASE_URL=https://fixture.invalid\nBOOTSTRAP_TOKEN=local-test-only\n'+script.slice(start,end);
  const result=spawnSync('bash',['-c',phase],{cwd:dir,encoding:'utf8',timeout:10000,env:{...process.env,PATH:dir+':'+process.env.PATH,FIXTURE_DIR:dir,PROVIDER_SECONDS:String(seconds),ACTIVE_COUNTS:JSON.stringify(counts)}});
  assert.equal(result.error,undefined);
  const calls=(await readFile(join(dir,'calls'),'utf8')).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
  return {...result,calls,elapsed:Number(await readFile(join(dir,'clock'),'utf8'))};
 }finally{await rm(dir,{recursive:true,force:true});}
}

test('a valid 150-second qualification is received instead of being cut off at 90 seconds',async()=>{
 const r=await run({seconds:150});
 assert.equal(r.status,0,r.stderr+'\n'+r.stdout);assert.equal(r.calls.length,1);
 assert.ok(r.calls[0].limit>=150);
 assert.deepEqual(r.calls[0].payload,{max_new_endpoints:1,probe_limit:1,probe_offset:0,known_candidates_only:true});
 assert.match(r.stdout,/5\/7/);
});
test('four actual endpoints remain failure even with sufficient transport time',async()=>{
 const r=await run({seconds:2,counts:[4]});
 assert.notEqual(r.status,0);assert.equal(r.calls.length,17);assert.doesNotMatch(r.stdout,/5\/7/);
});
test('missing responses cannot extend the old aggregate time ceiling or start an under-budget mutation',async()=>{
 const r=await run({seconds:9999});
 assert.notEqual(r.status,0);assert.ok(r.calls.length<17);assert.ok(r.elapsed<=17*90);
 assert.match(r.stdout,/budget exhausted; quorum is not proven/);
 assert.ok(r.calls.every(c=>c.seconds===c.limit));
});
test('the proof only accepts a real later fifth receipt, retaining bounded provider rotation',async()=>{
 const r=await run({seconds:150,counts:[4,4,5]});
 assert.equal(r.status,0,r.stderr);assert.equal(r.calls.length,3);
 assert.deepEqual(r.calls.map(c=>c.payload.probe_offset),[0,1,2]);assert.ok(r.elapsed<=17*90);
});
