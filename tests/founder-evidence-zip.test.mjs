import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFounderEvidenceZip } from '../src/evolution/founder-evidence-zip.js';

const utf8 = new TextEncoder();
function zipOne(name, data) {
  const n=utf8.encode(name), d=utf8.encode(JSON.stringify(data));
  let crc=0xffffffff;
  for (const x of d) { crc^=x; for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  crc=(crc^0xffffffff)>>>0;
  const local=new Uint8Array(30+n.length+d.length), lv=new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint32(14,crc,true);
  lv.setUint32(18,d.length,true); lv.setUint32(22,d.length,true); lv.setUint16(26,n.length,true);
  local.set(n,30);local.set(d,30+n.length);
  const central=new Uint8Array(46+n.length),cv=new DataView(central.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
  cv.setUint32(16,crc,true);cv.setUint32(20,d.length,true);cv.setUint32(24,d.length,true);
  cv.setUint16(28,n.length,true);central.set(n,46);
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,1,true);ev.setUint16(10,1,true);
  ev.setUint32(12,central.length,true);ev.setUint32(16,local.length,true);
  const all=new Uint8Array(local.length+central.length+end.length);
  all.set(local);all.set(central,local.length);all.set(end,local.length+central.length);
  return all;
}
test('Founder ZIP reader extracts only a valid, single stored report',()=>{
  const doc={schema:'MEL_FOUNDER_MISSION_TEST_EVIDENCE_V1',exit_code:0};
  assert.deepEqual(decodeFounderEvidenceZip(zipOne('founder-mission-test-evidence.json',doc).buffer),doc);
});
test('Founder ZIP reader rejects mismatched directory offsets and timestamps', () => {
  const original=zipOne('founder-mission-test-evidence.json',{ok:true});
  const nameLength=new DataView(original.buffer).getUint16(26,true);
  const center=30+nameLength+JSON.stringify({ok:true}).length;
  const badOffset=original.slice();
  new DataView(badOffset.buffer).setUint32(badOffset.length-6,center+1,true);
  assert.throws(()=>decodeFounderEvidenceZip(badOffset.buffer));
  const badTimestamp=original.slice();
  new DataView(badTimestamp.buffer).setUint32(center+12,1,true);
  assert.throws(()=>decodeFounderEvidenceZip(badTimestamp.buffer));
});

test('Founder ZIP reader rejects invalid CRC, traversal and appended extra bytes',()=>{
  const base=zipOne('founder-mission-test-evidence.json',{ok:true});
  const corrupt=base.slice();corrupt[corrupt.length-60]^=1;
  assert.throws(()=>decodeFounderEvidenceZip(corrupt.buffer));
  assert.throws(()=>decodeFounderEvidenceZip(zipOne('../founder-mission-test-evidence.json',{}).buffer));
  const tail=new Uint8Array(base.length+1);tail.set(base);
  assert.throws(()=>decodeFounderEvidenceZip(tail.buffer));
});
