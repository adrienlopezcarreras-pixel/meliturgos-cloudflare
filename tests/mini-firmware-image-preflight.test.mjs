import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function run(chip,magic=0xe9){
 const dir=mkdtempSync(join(tmpdir(),'mini-image-'));
 try{
  const b=Buffer.alloc(64);b[0]=magic;b[1]=2;b.writeUInt16LE(chip,12);
  const file=join(dir,'image.bin');writeFileSync(file,b);
  return spawnSync('python3',['tools/mini-updater/inspect_image.py',file],{encoding:'utf8'});
 }finally{rmSync(dir,{recursive:true,force:true})}
}
test('ESP32-S3 image header is read-only evidence, never flash approval',()=>{
 const r=run(9);assert.equal(r.status,0,r.stderr);
 const j=JSON.parse(r.stdout);assert.equal(j.chip_id,9);assert.equal(j.flash_allowed,false);
});
test('rejects a different target chip and corrupt image magic',()=>{
 assert.match(run(0).stderr,/ESP_IMAGE_CHIP_ID_NOT_ESP32S3/);
 assert.match(run(9,0).stderr,/ESP_IMAGE_HEADER_INVALID/);
});
