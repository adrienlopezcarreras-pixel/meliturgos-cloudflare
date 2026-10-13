import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
function part(name,start,size,kind,subtype){
 const b=Buffer.alloc(32);b.writeUInt16LE(0x50aa,0);b[2]=kind;b[3]=subtype;
 b.writeUInt32LE(start,4);b.writeUInt32LE(size,8);b.write(name,12,16,'ascii');return b;
}
function parts(){
 const rows=Buffer.concat([part('nvs',0x9000,0x6000,1,2),part('otadata',0xf000,0x2000,1,0),
 part('phy_init',0x11000,0x1000,1,1),part('ota_0',0x20000,0x600000,0,0x10),
 part('ota_1',0x620000,0x600000,0,0x11),part('storage',0xc20000,0x3d0000,1,0x81)]);
 const md5=Buffer.alloc(32,0xff);md5.writeUInt16LE(0xebeb,0);
 createHash('md5').update(rows).digest().copy(md5,16);
 const b=Buffer.alloc(4096,0xff);Buffer.concat([rows,md5]).copy(b);return b;
}
function ota(){
 const result=Buffer.alloc(8192,0xff), first=Buffer.alloc(32,0xff);
 first.writeUInt32LE(1,0);first.writeUInt32LE(2,24);
 let crc=0;
 for(const x of first.subarray(0,4)) {
  crc ^=x;
  for(let j=0;j<8;j++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;
 }
 first.writeUInt32LE((crc^0xffffffff)>>>0,28);first.copy(result);return result;
}
function backup(){
 const b=Buffer.alloc(0x600000,0xff);
 const head=Buffer.alloc(24);head[0]=0xe9;head[1]=1;head.writeUInt16LE(9,12);head[23]=1;
 const seg=Buffer.alloc(8);seg.writeUInt32LE(0x42000020,0);seg.writeUInt32LE(16,4);
 const data=Buffer.alloc(16,0x3a);
 const before=Buffer.concat([head,seg,data]);
 const checksum=data.reduce((c,v)=>c^v,0xef);
 const pad=Buffer.alloc((15-before.length%16)%16);
 const body=Buffer.concat([before,pad,Buffer.from([checksum])]);
 const app=Buffer.concat([body,createHash('sha256').update(body).digest()]);
 app.copy(b);return b;
}

const SCRIPT='tools/mini-updater/plan_ota_upgrade.py';
function check(modify=()=>{}) {
 const root=mkdtempSync(join(tmpdir(),'mini-safe-ota-plan-')),d=join(root,'backup');
 mkdirSync(d);
 try {
  const p=parts(),o=ota(),original=backup(),firmware=original.subarray(0,96);
  const sha=data=>createHash('sha256').update(data).digest('hex');
  const fixture={root,d,p,o,original,firmware,
   sha256:sha(firmware),backupHash:sha(original)};
  writeFileSync(join(d,'partitions.bin'),p);
  writeFileSync(join(d,'otadata.bin'),o);
  writeFileSync(join(d,'ota_0.bin'),original);
  const inspect=spawnSync('python3',['tools/mini-updater/inspect_ota_backup.py','--partitions',join(d,'partitions.bin'),'--otadata',join(d,'otadata.bin'),'--backup',join(d,'ota_0.bin')],{encoding:'utf8'});
  assert.equal(inspect.status,0,inspect.stderr);
  writeFileSync(join(d,'verification.json'),inspect.stdout);
  writeFileSync(join(d,'status.json'),JSON.stringify({schema:'mel-mini-ota-backup-job-v1',state:'SUCCESS',flash_performed:false,flash_allowed:false,backup_sha256:sha(original),backup_bytes:original.length,partition_offset:'0x20000',partition_size_bytes:original.length}));
  writeFileSync(join(root,'candidate.bin'),firmware);
  modify(fixture);
  return spawnSync('python3',[SCRIPT,'--backup-dir',d,'--firmware',join(root,'candidate.bin'),'--expected-sha256',fixture.sha256],{encoding:'utf8'});
 } finally {rmSync(root,{recursive:true,force:true});}
}
test('offline OTA plan requires original SHA-verified readback and cannot enable flashing',()=>{
 const r=check();assert.equal(r.status,0,r.stderr);
 const q=JSON.parse(r.stdout);
 assert.equal(q.status,'OFFLINE_PLAN_VERIFIED_FLASH_BLOCKED');
 assert.equal(q.inactive_slot_candidate,'ota_1');
 assert.equal(q.inactive_offset,'0x620000');
 assert.equal(q.existing_backup_size_bytes,0x600000);
 assert.equal(q.backup_verified_offline,true);
 assert.equal(q.firmware_verified_offline,true);
 assert.equal(q.running_slot_verified_on_device,false);
 assert.equal(q.ota_rollback_on_real_device_verified,false);
 assert.equal(q.flash_allowed,false);
 assert.equal(q.flash_performed,false);
});
test('stale or forged completed backup and proof never approve update',()=>{
 for(const mutation of [
  v=>writeFileSync(join(v.d,'status.json'),JSON.stringify({schema:'mel-mini-ota-backup-job-v1',state:'RUNNING',flash_performed:false,flash_allowed:false})),
  v=>{const x=Buffer.from(v.original);x[32]^=1;writeFileSync(join(v.d,'ota_0.bin'),x)},
  v=>writeFileSync(join(v.d,'verification.json'),JSON.stringify({full_backup_sha256:'0'.repeat(64)})),
  v=>{const j=JSON.parse(requireProof(v));j.partition_offset='0x0';writeFileSync(join(v.d,'status.json'),JSON.stringify(j))},
 ]) {
  const r=check(mutation);assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/"flash_allowed": false/);
 }
});
function requireProof(fixture) {
 return JSON.stringify({schema:'mel-mini-ota-backup-job-v1',state:'SUCCESS',flash_performed:false,flash_allowed:false,backup_sha256:fixture.backupHash,backup_bytes:fixture.original.length,partition_offset:'0x20000',partition_size_bytes:fixture.original.length});
}
test('wrong candidate SHA or corrupted candidate fail closed before any flash',()=>{
 for(const mutation of [
  v=>v.sha256='0'.repeat(64),
  v=>{const copy=Buffer.from(v.firmware);copy[0]=0;writeFileSync(join(v.root,'candidate.bin'),copy);v.sha256=createHash('sha256').update(copy).digest('hex')},
 ]) {
  const r=check(mutation);assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/"flash_allowed": false/);
 }
});
