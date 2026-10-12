import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const SCRIPT='tools/mini-updater/inspect_ota_state.py';
function part(name,start,size,kind,subtype){
 const x=Buffer.alloc(32);x.writeUInt16LE(0x50aa,0);x[2]=kind;x[3]=subtype;
 x.writeUInt32LE(start,4);x.writeUInt32LE(size,8);x.write(name,12,16,'ascii');return x;
}
function layout(){
 const rows=[part('nvs',0x9000,0x6000,1,2),part('otadata',0xf000,0x2000,1,0),
 part('phy_init',0x11000,0x1000,1,1),part('ota_0',0x20000,0x600000,0,0x10),
 part('ota_1',0x620000,0x600000,0,0x11),part('storage',0xc20000,0x3d0000,1,0x81)];
 const body=Buffer.concat(rows),md5=Buffer.alloc(32,0xff);md5.writeUInt16LE(0xebeb,0);
 createHash('md5').update(body).digest().copy(md5,16);
 const table=Buffer.alloc(4096,0xff);Buffer.concat([body,md5]).copy(table);
 return table;
}
function otadata({crcCorrupt=false,state=2,second=false,extraTail=false}={}){
 const b=Buffer.alloc(8192,0xff);
 const e=Buffer.alloc(32,0xff);e.writeUInt32LE(1,0);e.writeUInt32LE(state,24);
 let crc=0;
 for(const v of e.subarray(0,4)){
  crc^=v;
  for(let i=0;i<8;i++) crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;
 }
 crc=(crc^0xFFFFFFFF)>>>0;
 e.writeUInt32LE((crcCorrupt?(crc^1):crc)>>>0,28);
 e.copy(b);if(second)e.copy(b,4096);if(extraTail)b[4096+99]=0;
 return b;
}
function invoke(meta=otadata(),table=layout()){
 const dir=mkdtempSync(join(tmpdir(),'mini-ota-'));
 try {
  const p=join(dir,'parts.bin'),o=join(dir,'otadata.bin');
  writeFileSync(p,table);writeFileSync(o,meta);
  return spawnSync('python3',[SCRIPT,'--partitions',p,'--otadata',o],{encoding:'utf8'});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('16MB six-partition read-only proof selects ota_0 and alternate ota_1',()=>{
 const r=invoke();assert.equal(r.status,0,r.stderr);const j=JSON.parse(r.stdout);
 assert.equal(j.ota_records[0].state,'VALID');assert.equal(j.ota_records[0].crc_valid,true);
 assert.equal(j.ota_records[1].status,'ERASED');
 assert.equal(j.selected_boot_slot_from_otadata,'ota_0');assert.equal(j.alternative_slot,'ota_1');
 assert.equal(j.running_slot_verified,false);assert.equal(j.flash_allowed,false);
});
test('bad CRC, pending verification and conflicting entries fail closed',()=>{
 for(const meta of [otadata({crcCorrupt:true}),otadata({state:1}),otadata({second:true}),otadata({extraTail:true})]){
  const r=invoke(meta);assert.equal(r.status,0,r.stderr);
  const j=JSON.parse(r.stdout);assert.equal(j.selected_boot_slot_from_otadata,null);
  assert.equal(j.flash_allowed,false);
 }
});
test('bad dump length and altered partition MD5 fail closed',()=>{
 const r=invoke(Buffer.alloc(32,0xff));assert.equal(r.status,2);assert.match(r.stderr,/OTA_DATA_SIZE_INVALID/);
 const p=layout();p[32+12]^=1;const s=invoke(otadata(),p);
 assert.equal(s.status,2);assert.match(s.stderr,/PARTITION_TABLE_MD5_INVALID/);
});
