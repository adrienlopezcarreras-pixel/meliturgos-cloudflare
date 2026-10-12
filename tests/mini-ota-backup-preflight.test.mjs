import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const script='tools/mini-updater/inspect_ota_backup.py';
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
 let crc=0xffffffff;
 for(const x of first.subarray(0,4)) {
  crc ^=x;
  for(let j=0;j<8;j++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;
 }
 first.writeUInt32LE(crc>>>0,28);first.copy(result);return result;
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
function run({p=parts(),o=ota(),b=backup(),slot='ota_0'}={}){
 const d=mkdtempSync(join(tmpdir(),'mini-ota-backup-'));
 try{
  const pf=join(d,'p.bin'),of=join(d,'ota.bin'),bf=join(d,'app.bin');
  writeFileSync(pf,p);writeFileSync(of,o);writeFileSync(bf,b);
  return spawnSync('python3',[script,'--partitions',pf,'--otadata',of,'--backup',bf,'--slot',slot],{encoding:'utf8'});
 }finally{rmSync(d,{recursive:true,force:true})}
}
test('valid 6MiB selected ota_0 dump reports app integrity; never approves flashing',()=>{
 const r=run();assert.equal(r.status,0,r.stderr);const j=JSON.parse(r.stdout);
 assert.equal(j.app_chip_id,9);assert.equal(j.partition_size_bytes,0x600000);
 assert.equal(j.app_structure_valid,true);assert.equal(j.app_checksum_valid,true);
 assert.equal(j.app_embedded_sha256_valid,true);assert.equal(j.trailing_bytes_all_ff,true);
 assert.equal(j.flash_allowed,false);assert.equal(j.rollback_tested,false);
});
test('wrong partition size or source slot is rejected',()=>{
 assert.match(run({b:backup().subarray(0,-1)}).stderr,/OTA_BACKUP_SIZE_MISMATCH/);
 assert.match(run({slot:'ota_1'}).stderr,/OTA_BACKUP_SOURCE_NOT_SELECTED_BY_METADATA/);
});
test('altered app checksum/hash and corrupt partition table are rejected',()=>{
 const corrupted=backup();corrupted[32]^=1;
 assert.match(run({b:corrupted}).stderr,/ESP_IMAGE_CHECKSUM_INVALID/);
 const hash=backup();hash[95]^=1;
 assert.match(run({b:hash}).stderr,/ESP_IMAGE_EMBEDDED_SHA256_INVALID/);
 const invalid=parts();invalid[24]^=1;
 assert.match(run({p:invalid}).stderr,/PARTITION_TABLE_MD5_INVALID/);
});
