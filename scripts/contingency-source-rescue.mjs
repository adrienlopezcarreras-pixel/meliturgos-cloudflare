import { readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { admitGitHubSourceRescue, selectSourceArchiveRoots, sensitiveSourceArchivePaths } from '../src/continuity/github-source-rescue.js';

const DIR='artifacts/contingency';
let gate;
try {
  const [report,signed]=await Promise.all([
    readFile(DIR+'/external-health.json','utf8').then(JSON.parse),
    readFile(DIR+'/signed-health.json','utf8').then(JSON.parse),
  ]);
  const url=new URL(String(process.env.MEL_CONTINGENCY_HEALTH_URL||''));
  gate=await admitGitHubSourceRescue(report,signed,{
    secret:process.env.MEL_CONTINGENCY_PROBE_HMAC_KEY,
    expectedHost:url.hostname,now:Date.now(),
  });
}catch{gate={ok:false,code:'OUTAGE_EVIDENCE_NOT_READABLE'};}
if(gate.ok!==true){
  console.error('SOURCE_RESCUE_BLOCKED:'+gate.code);
  process.exitCode=2;
}else{
  const sha=String(process.env.GITHUB_SHA||'').toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('GITHUB_SOURCE_SHA_REQUIRED');
  const actual=execFileSync('git',['rev-parse','HEAD'],{
    encoding:'utf8',timeout:10000,maxBuffer:1024*1024,
  }).trim().toLowerCase();
  if(actual!==sha)throw Error('GITHUB_SOURCE_SHA_MISMATCH');
  await mkdir(DIR,{recursive:true});
  const archive=DIR+'/mel-source-only.tar.gz';
  // The repository also tracks imported documents, exports and diagnostics.
  // A source rescue must not package those into a second distributable artifact.
  const roots = execFileSync('git',['ls-tree','--name-only','HEAD'],{
    encoding:'utf8',timeout:10000,maxBuffer:1024*1024,
  }).split('\n').map(value => value.trim()).filter(Boolean);
  const sourcePaths = selectSourceArchiveRoots(roots);
  if (!sourcePaths.includes('src') || !sourcePaths.includes('package.json')) {
    throw Error('SOURCE_ARCHIVE_REQUIRED_CODE_ROOTS_MISSING');
  }
  const sourceFiles = execFileSync('git',['ls-tree','-r','-z','--name-only','HEAD','--',...sourcePaths],{
    encoding:'utf8',timeout:10000,maxBuffer:8*1024*1024,
  }).split('\0').filter(Boolean);
  const unsafe = sensitiveSourceArchivePaths(sourceFiles);
  if (unsafe.length) throw Error('SOURCE_ARCHIVE_SENSITIVE_PATHS_BLOCKED');
  execFileSync('git',['archive','--format=tar.gz','--output='+archive,'HEAD','--',...sourcePaths],{
    timeout:120000,maxBuffer:1024*1024,
  });
  const size=(await stat(archive)).size;
  if(size<128||size>128*1024*1024)throw Error('SOURCE_ARCHIVE_SIZE_OUT_OF_POLICY');
  const hash=createHash('sha256');
  for await(const bytes of createReadStream(archive))hash.update(bytes);
  const receipt={schema:'mel.contingency-source-rescue/v1',status:'SOURCE_ARCHIVED_ONLY',
    source_sha:sha,archive_sha256:hash.digest('hex'),archive_bytes:size,
    archived_roots:sourcePaths,
    outage_observed_at:gate.observed_at,independent_evidence:gate.code,
    deployed_sha_verified:false,max_running:false,d1_restored:false,
    r2_restored:false,failover_performed:false};
  await writeFile(DIR+'/source-receipt.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log('SOURCE_ARCHIVED_ONLY: sha='+sha+', bytes='+size);
}
