import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

function image(chip=9) {
 const header=Buffer.alloc(24);header[0]=0xe9;header[1]=1;
 header.writeUInt16LE(chip,12);header[23]=1;
 const seg=Buffer.alloc(8);seg.writeUInt32LE(0x42000020,0);seg.writeUInt32LE(16,4);
 const data=Buffer.alloc(16,0xa5);
 const front=Buffer.concat([header,seg,data]);
 const pad=Buffer.alloc((15-front.length%16)%16);
 const checksum=data.reduce((value,b)=>value^b,0xef);
 const body=Buffer.concat([front,pad,Buffer.from([checksum])]);
 return Buffer.concat([body,createHash('sha256').update(body).digest()]);
}
function check(bytes) {
 const dir=mkdtempSync(join(tmpdir(),'mini-esp-image-'));
 try{
  const file=join(dir,'firmware.bin');writeFileSync(file,bytes);
  return spawnSync('python3',['tools/mini-updater/inspect_image.py',file],{encoding:'utf8'});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test('ESP32-S3 valid image proves segments, checksum and embedded SHA without flash approval',()=>{
 const r=check(image());assert.equal(r.status,0,r.stderr);
 const j=JSON.parse(r.stdout);
 assert.equal(j.chip_id,9);assert.equal(j.segment_count,1);
 assert.equal(j.checksum_valid,true);assert.equal(j.embedded_sha256_valid,true);
 assert.equal(j.structurally_valid,true);assert.equal(j.flash_allowed,false);
});
test('different chip and magic rejected',()=>{
 const wrongChip=check(image(0));assert.match(wrongChip.stderr,/ESP_IMAGE_CHIP_ID_NOT_ESP32S3/);
 const badMagic=image();badMagic[0]=0;assert.match(check(badMagic).stderr,/ESP_IMAGE_HEADER_INVALID/);
});
test('segment corruption and malformed length rejected',()=>{
 const b=image();b[32]^=1;assert.match(check(b).stderr,/ESP_IMAGE_CHECKSUM_INVALID/);
 const truncated=image();truncated.writeUInt32LE(0xffffffff,28);
 assert.match(check(truncated).stderr,/ESP_IMAGE_TRUNCATED_SEGMENT_DATA/);
});
test('embedded SHA tampering and truncation rejected',()=>{
 const b=image();b[b.length-1]^=1;
 assert.match(check(b).stderr,/ESP_IMAGE_EMBEDDED_SHA256_INVALID/);
 const t=image().subarray(0,-1);
 assert.match(check(t).stderr,/ESP_IMAGE_HASH_LENGTH_INVALID/);
});
