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
