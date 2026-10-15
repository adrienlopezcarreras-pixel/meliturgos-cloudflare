import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {miniFirmwareStageCommand} from '../src/devices/mini-firmware-stage-companion.js';

function sampleImage(){
 const header=Buffer.alloc(24);header[0]=0xe9;header[1]=1;
 header.writeUInt16LE(9,12);header[23]=1;
 const segment=Buffer.alloc(8);segment.writeUInt32LE(0x42000020,0);
 segment.writeUInt32LE(1048576,4);
 const data=Buffer.alloc(1048576,0xa5);
 const front=Buffer.concat([header,segment,data]);
 const padding=Buffer.alloc((15-front.length%16)%16);
 const checksum=data.reduce((v,b)=>v^b,0xef);
 const body=Buffer.concat([front,padding,Buffer.from([checksum])]);
 return Buffer.concat([body,createHash('sha256').update(body).digest()]);
}
test('Windows PowerShell stages intact MINI app and rejects checksum and embedded SHA corruption', {
 skip:process.platform!=='win32',
 timeout:160000,
},()=>{
 const root=mkdtempSync(join(tmpdir(),'mel-mini-ps-stage-'));
 try{
  const downloads=join(root,'user','Downloads'),local=join(root,'appdata');
  mkdirSync(downloads,{recursive:true});mkdirSync(local,{recursive:true});
  const env={...process.env,USERPROFILE:join(root,'user'),LOCALAPPDATA:local};
  const run=(file,bytes)=>{
   const filePath=join(downloads,file);
   writeFileSync(filePath,bytes);
   const sha=createHash('sha256').update(bytes).digest('hex');
   const command=miniFirmwareStageCommand({filename:file,sha256:sha}).command;
   const ps=join(root,file+'.ps1');writeFileSync(ps,command);
   const child=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',ps],
    {env,encoding:'utf8',timeout:65000,windowsHide:true});
   return {child,sha,staged:join(local,'MEL','mini-firmware',sha+'.bin')};
  };
  const valid=sampleImage();
  const ok=run('valid.bin',valid);
  assert.equal(ok.child.status,0,ok.child.stderr);
  const result=JSON.parse(ok.child.stdout.trim());
  assert.equal(result.status,'STAGED_IMAGE_INTEGRITY_VERIFIED_FLASH_BLOCKED');
  assert.equal(result.image_checksum_valid,true);
  assert.equal(result.embedded_sha256_valid,true);
  assert.equal(result.partition_fit_verified,false);
  assert.equal(result.flash_allowed,false);
  assert.equal(result.flash_performed,false);
  assert.ok(existsSync(ok.staged));
  assert.deepEqual(readFileSync(ok.staged),valid);

  const damaged=Buffer.from(valid);damaged[40]^=1;
  const checksumFail=run('bad-checksum.bin',damaged);
  assert.notEqual(checksumFail.child.status,0,'corrupt segment must fail');
  assert.match(checksumFail.child.stderr,/MINI_FIRMWARE_SEGMENT_CHECKSUM_INVALID/);
  assert.equal(existsSync(checksumFail.staged),false);

  const alteredDigest=Buffer.from(valid);alteredDigest[alteredDigest.length-1]^=1;
  const shaFail=run('bad-embedded.bin',alteredDigest);
  assert.notEqual(shaFail.child.status,0,'bad embedded digest must fail');
  assert.match(shaFail.child.stderr,/MINI_FIRMWARE_EMBEDDED_SHA256_INVALID/);
  assert.equal(existsSync(shaFail.staged),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
