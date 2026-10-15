import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('local bootloader preflight requires explicit reset acknowledgement',()=>{
  const r=spawnSync('python3',['tools/mini-updater/local_readonly_preflight.py','--port','COM3','--output','unused'],{encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/ack-bootloader required/);
});
test('attended MINI readback requests normal boot after each esptool command without flash',async()=>{
  const s=await readFile(new URL('../tools/mini-updater/local_readonly_preflight.py',import.meta.url),'utf8');
  assert.match(s,/read_flash/);
  assert.match(s,/flash_allowed.*False/);
  assert.match(s,/"--after", "hard_reset"/);
  assert.doesNotMatch(s,/"--after", "no_reset"/);
  assert.doesNotMatch(s,/write_flash|erase_flash|erase_region/);
});

test('stale partition dump is refused before bootloader operations',()=>{
  const dir=mkdtempSync(join(tmpdir(),'mini-stale-'));
  try {
    writeFileSync(join(dir,'partitions-0x8000.bin'),Buffer.alloc(4096,0xff));
    const run=spawnSync('python3',['tools/mini-updater/local_readonly_preflight.py','--port','COM3','--output',dir,'--ack-bootloader'],{encoding:'utf8'});
    assert.notEqual(run.status,0);
    assert.match(run.stderr,/Existing partition dump/);
    assert.doesNotMatch(run.stdout,/partition_dump.*true/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync} from 'node:fs';

function part(name,start,size,kind,subtype){
 const v=Buffer.alloc(32);v.writeUInt16LE(0x50aa,0);
 v[2]=kind;v[3]=subtype;v.writeUInt32LE(start,4);v.writeUInt32LE(size,8);
 v.write(name,12,16,'ascii');return v;
}
function partitionDump(){
 const rows=Buffer.concat([
  part('nvs',0x9000,0x6000,1,2),part('otadata',0xf000,0x2000,1,0),
  part('phy_init',0x11000,0x1000,1,1),part('ota_0',0x20000,0x600000,0,0x10),
  part('ota_1',0x620000,0x600000,0,0x11)
 ]);
 const marker=Buffer.alloc(32,0xff);marker.writeUInt16LE(0xebeb,0);
 createHash('md5').update(rows).digest().copy(marker,16);
 const b=Buffer.alloc(4096,0xff);Buffer.concat([rows,marker]).copy(b);return b;
}
function otaData(ambiguous=false){
 const b=Buffer.alloc(8192,0xff),e=Buffer.alloc(32,0xff);
 e.writeUInt32LE(1,0);e.writeUInt32LE(2,24);
 let crc=0;for(const v of e.subarray(0,4)){
  crc^=v;for(let i=0;i<8;i++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;
 }
 e.writeUInt32LE((crc^0xffffffff)>>>0,28);
 e.copy(b);if(ambiguous)e.copy(b,4096);
 return b;
}
test('read-only live preflight reads OTA from the partition offset and refuses ambiguous metadata',()=>{
 const root=mkdtempSync(join(tmpdir(),'mini-live-readback-fixture-'));
 try{
  const moduleDir=join(root,'esptool');
  mkdirSync(moduleDir);
  writeFileSync(join(moduleDir,'__main__.py'),`import os,sys,shutil
args=sys.argv[1:]
# The local tool must return the board to normal firmware at the end of each read.
if '--after' not in args or args[args.index('--after')+1]!='hard_reset':
 sys.exit(80)
if any(x in args for x in ['write_flash','erase_flash','erase_region']):
 sys.exit(77)
if 'chip_id' in args:
 print('Chip is ESP32-S3')
elif 'flash_id' in args:
 print('Detected flash size: 16MB')
elif 'read_flash' in args:
 i=args.index('read_flash')
 offset=int(args[i+1],0)
 size=int(args[i+2],0)
 source=os.environ.get('MEL_FAKE_PARTITIONS') if offset==0x8000 else os.environ.get('MEL_FAKE_OTADATA') if offset==0xf000 else None
 if not source or (offset==0x8000 and size!=4096) or (offset==0xf000 and size!=8192):
  sys.exit(78)
 shutil.copyfile(source,args[i+3])
 print('Readback complete')
else:
 sys.exit(79)
`);
  const partitionFile=join(root,'table.bin'),otaFile=join(root,'ota.bin');
  writeFileSync(partitionFile,partitionDump());
  const invoke=(ambiguous,truncated=false)=>{
   const out=join(root,ambiguous?'ambiguous':truncated?'truncated':'valid');
   writeFileSync(otaFile,truncated?otaData().subarray(0,-1):otaData(ambiguous));
   const env={...process.env,PYTHONPATH:root,MEL_FAKE_PARTITIONS:partitionFile,MEL_FAKE_OTADATA:otaFile};
   const run=spawnSync('python3',['tools/mini-updater/local_readonly_preflight.py','--port','COM4','--output',out,'--ack-bootloader'],{encoding:'utf8',env});
   const report=JSON.parse(readFileSync(join(out,'preflight.json'),'utf8'));
   return {run,report};
  };
  const ok=invoke(false);
  assert.equal(ok.run.status,0,ok.run.stderr);
  assert.equal(ok.report.ota_slot_from_metadata,'ota_0');
  assert.equal(ok.report.ota_selection.alternative_slot,'ota_1');
  assert.equal(ok.report.ota_readback.bytes,8192);
  assert.equal(ok.report.ota_metadata_unambiguous,true);
  assert.equal(ok.report.running_slot_verified_on_device,false);
  assert.equal(ok.report.flash_allowed,false);
  const ambiguous=invoke(true);
  assert.equal(ambiguous.run.status,2);
  assert.equal(ambiguous.report.error,'MINI_OTA_SLOT_AMBIGUOUS');
  assert.equal(ambiguous.report.flash_allowed,false);
  const short=invoke(false,true);
  assert.equal(short.run.status,2);
  assert.equal(short.report.error,'MINI_OTADATA_READBACK_SIZE_INVALID');
  assert.equal(short.report.flash_allowed,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
