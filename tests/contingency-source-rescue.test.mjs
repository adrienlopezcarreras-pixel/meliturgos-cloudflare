import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { signContingencyProbeReport } from '../src/continuity/contingency-probe-auth.js';
import { admitGitHubSourceRescue } from '../src/continuity/github-source-rescue.js';
const now=Date.parse('2026-11-03T21:00:00Z');
const secret='fixture-signed-incident-secret-not-production-012345';
const host='meliturgos.adrien-lopezcarreras.workers.dev';
const basic={schema:'mel.external-health-monitor/v1',independent:true,
  status:'DOWN',code:'OUTAGE_QUORUM',target_host:host,failover_performed:false,
  observed_at:'2026-11-03T20:59:00Z',
  samples:[{status:'DOWN'},{status:'DOWN'},{status:'UP'}]};
async function evidence(report=basic){
  return signContingencyProbeReport({
    part:'cloudflare',up:false,observer:'github-actions-external-monitor',
    evidence_id:'github-run-123456-1',observed_at:report.observed_at,
  },{secret,cryptoImpl:webcrypto});
}
const config={secret,expectedHost:host,now,cryptoImpl:webcrypto};
test('signed outage quorum admits source-only archive and NEVER failover',async()=>{
  const r=await admitGitHubSourceRescue(basic,await evidence(),config);
  assert.equal(r.ok,true);assert.equal(r.source_archive_allowed,true);
  for(const key of ['failover_allowed','max_running','d1_restored','r2_restored'])
    assert.equal(r[key],false,key);
});
test('only a majority of independently witnessed DOWN reports admits an archive',async()=>{
  const signed=await evidence();
  for(const row of [
    {...basic,status:'UP'}, {...basic,status:'UNKNOWN'}, {...basic,code:'HEALTH_QUORUM'},
    {...basic,target_host:'attacker.example'}, {...basic,independent:false},
    {...basic,failover_performed:true},
    {...basic,samples:[{status:'DOWN'},{status:'UP'},{status:'UP'}]},
    {...basic,samples:[{status:'DOWN'}]},
  ])assert.equal((await admitGitHubSourceRescue(row,signed,config)).ok,false);
});
test('tampered, stale, unauthenticated incidents are rejected',async()=>{
  const signed=await evidence();
  for(const row of [
    {...signed,up:true}, {...signed,signature:'0'.repeat(64)},
    {...signed,observer:'another-monitor'}, {...signed,evidence_id:'untrusted'},
    {...signed,observed_at:'2026-11-03T20:58:00Z'},null,
  ])assert.equal((await admitGitHubSourceRescue(basic,row,config)).ok,false);
  assert.equal((await admitGitHubSourceRescue(basic,signed,{...config,secret:''})).ok,false);
  const stale={...basic,observed_at:'2026-11-03T20:00:00Z'};
  assert.equal((await admitGitHubSourceRescue(stale,await evidence(stale),config)).ok,false);
  assert.equal((await admitGitHubSourceRescue(basic,signed,{...config,expectedHost:'other.example'})).ok,false);
});

test('source rescue selects only allowlisted software roots and excludes tracked private data',async()=>{
  const {selectSourceArchiveRoots}=await import('../src/continuity/github-source-rescue.js');
  assert.deepEqual(selectSourceArchiveRoots([
    'src','scripts','package.json','migrations','.github','tests',
    'imports','exports','docs','backups','data','.env','secrets','assets',
    'src','node_modules','archive','memory','private',
  ]),['.github','migrations','package.json','scripts','src','tests']);
  assert.deepEqual(selectSourceArchiveRoots(null),[]);
  const {readFileSync}=await import('node:fs');
  const runner=readFileSync(new URL('../scripts/contingency-source-rescue.mjs',import.meta.url),'utf8');
  assert.match(runner,/selectSourceArchiveRoots\(roots\)/);
  assert.match(runner,/SOURCE_ARCHIVE_REQUIRED_CODE_ROOTS_MISSING/);
  assert.match(runner,/\.\.\.sourcePaths\]/);
  assert.doesNotMatch(runner,/--output='\+archive,'HEAD'\]/);
});

test('source rescue CLI makes a real Git archive in an isolated fixture and rejects altered evidence',async()=>{
  const {mkdtemp,mkdir,writeFile,readFile,rm,stat}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {spawnSync,execFileSync}=await import('node:child_process');
  const {createHash}=await import('node:crypto');
  const {fileURLToPath}=await import('node:url');
  const root=await mkdtemp(join(tmpdir(),'mel-source-rescue-proof-'));
  const commands=(args)=>execFileSync('git',args,{cwd:root,timeout:10000,encoding:'utf8'});
  const script=fileURLToPath(new URL('../scripts/contingency-source-rescue.mjs',import.meta.url));
  const output=join(root,'artifacts','contingency');
  try {
    commands(['init','-q']);
    await writeFile(join(root,'README.md'),'MEL test-only tracked code\n'.repeat(100));
    commands(['add','README.md']);
    commands(['-c','user.name=MEL Test','-c','user.email=test@example.invalid',
      'commit','-qm','isolated fixture']);
    const sha=commands(['rev-parse','HEAD']).trim();
    await mkdir(output,{recursive:true});
    const observedAt=new Date().toISOString();
    const down={...basic,observed_at:observedAt,
      samples:[{status:'DOWN'},{status:'DOWN'},{status:'DOWN'}]};
    const proof=await evidence(down);
    await writeFile(join(output,'external-health.json'),JSON.stringify(down));
    await writeFile(join(output,'signed-health.json'),JSON.stringify(proof));
    const env={...process.env,GITHUB_SHA:sha,MEL_CONTINGENCY_PROBE_HMAC_KEY:secret,
      MEL_CONTINGENCY_HEALTH_URL:'https://'+host+'/api/public/contingency/heartbeat'};
    const run=()=>spawnSync(process.execPath,[script],{cwd:root,env,timeout:30000,encoding:'utf8'});
    const good=run();
    assert.equal(good.status,0,good.stderr.slice(0,250));
    assert.match(good.stdout,/SOURCE_ARCHIVED_ONLY/);
    const receipt=JSON.parse(await readFile(join(output,'source-receipt.json'),'utf8'));
    const archive=await readFile(join(output,'mel-source-only.tar.gz'));
    assert.ok((await stat(join(output,'mel-source-only.tar.gz'))).size>=128);
    assert.equal(receipt.source_sha,sha);
    assert.equal(receipt.archive_sha256,createHash('sha256').update(archive).digest('hex'));
    assert.equal(receipt.status,'SOURCE_ARCHIVED_ONLY');
    assert.equal(receipt.max_running,false);
    assert.equal(receipt.d1_restored,false);
    assert.equal(receipt.r2_restored,false);
    assert.equal(receipt.failover_performed,false);
    await rm(join(output,'source-receipt.json'));
    await rm(join(output,'mel-source-only.tar.gz'));
    await writeFile(join(output,'signed-health.json'),JSON.stringify({...proof,up:true}));
    const forged=run();
    assert.equal(forged.status,2,forged.stderr.slice(0,250));
    await assert.rejects(readFile(join(output,'source-receipt.json')),
      e=>e?.code==='ENOENT');
    await assert.rejects(readFile(join(output,'mel-source-only.tar.gz')),
      e=>e?.code==='ENOENT');
  } finally { await rm(root,{recursive:true,force:true}); }
});
