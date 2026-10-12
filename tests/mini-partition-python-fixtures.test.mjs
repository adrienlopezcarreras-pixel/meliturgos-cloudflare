import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

function entry(name, offset, size, type=0, subtype=0x10) {
  const b=Buffer.alloc(32,0);
  b.writeUInt16LE(0x50aa,0);
  b[2]=type;b[3]=subtype;
  b.writeUInt32LE(offset,4);b.writeUInt32LE(size,8);
  b.write(name,12,16,'ascii');
  return b;
}
function check(parts) {
  const dir=mkdtempSync(join(tmpdir(),'mel-mini-partitions-'));
  try {
    const file=join(dir,'partition.bin');
    writeFileSync(file,Buffer.concat(parts));
    return spawnSync('python3',['tools/mini-updater/inspect_partitions.py',file],{encoding:'utf8'});
  } finally {rmSync(dir,{recursive:true,force:true})}
}
test('valid ESP-IDF partition dump remains read-only',()=>{
  const r=check([entry('nvs',0x9000,0x6000,1,2),entry('ota_0',0x20000,0x200000)]);
  assert.equal(r.status,0,r.stderr);
  const data=JSON.parse(r.stdout);
  assert.equal(data.valid,true);
  assert.equal(data.flash_allowed,false);
  assert.equal(data.partitions.length,2);
});
test('valid optional MD5 is accepted, corrupt MD5 rejected',()=>{
  const part=entry('nvs',0x9000,0x6000,1,2);
  const md5=Buffer.alloc(32,0);md5.writeUInt16LE(0xebeb,0);
  createHash('md5').update(part).digest().copy(md5,16);
  assert.equal(check([part,md5]).status,0);
  md5[16]^=1;
  const r=check([part,md5]);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/PARTITION_TABLE_MD5_INVALID/);
});
test('overlapping partitions are rejected',()=>{
  const r=check([entry('ota_0',0x20000,0x200000),entry('ota_1',0x21000,0x200000)]);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/PARTITION_OVERLAP/);
});
test('invalid partition magic is rejected',()=>{
  const r=check([Buffer.alloc(32,0)]);
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/PARTITION_TABLE_MAGIC_INVALID/);
});


test('ESP-IDF 16MB MINI layout: six partitions, FF-reserved MD5 and erased tail',()=>{
  const parts=[
    entry('nvs',0x9000,0x6000,1,2),
    entry('otadata',0xf000,0x2000,1,0),
    entry('phy_init',0x11000,0x1000,1,1),
    entry('ota_0',0x20000,0x600000,0,0x10),
    entry('ota_1',0x620000,0x600000,0,0x11),
    entry('storage',0xc20000,0x3d0000,1,0x81),
  ];
  const payload=Buffer.concat(parts);
  const md5=Buffer.alloc(32,0xff);md5.writeUInt16LE(0xebeb,0);
  createHash('md5').update(payload).digest().copy(md5,16);
  const full=Buffer.alloc(4096,0xff);
  Buffer.concat([payload,md5]).copy(full);
  const r=check([full]);assert.equal(r.status,0,r.stderr);
  const j=JSON.parse(r.stdout);
  assert.deepEqual(j.partitions.map(p=>p.name),['nvs','otadata','phy_init','ota_0','ota_1','storage']);
  assert.equal(j.partitions.find(p=>p.name==='ota_0').size,6291456);
  assert.equal(j.partitions.find(p=>p.name==='ota_1').offset,0x620000);
  assert.equal(j.flash_allowed,false);
  const tampered=Buffer.from(full);tampered[199]^=1;
  assert.match(check([tampered]).stderr,/PARTITION_TABLE_MD5_INVALID/);
  const invalidReserved=Buffer.from(full);invalidReserved[194]=0x42;
  assert.match(check([invalidReserved]).stderr,/PARTITION_TABLE_MD5_INVALID/);
  const invalidTail=Buffer.from(full);invalidTail[300]=0x42;
  assert.match(check([invalidTail]).stderr,/PARTITION_TABLE_TRAILING_DATA/);
});
