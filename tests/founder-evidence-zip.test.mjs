import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFounderEvidenceZip } from '../src/evolution/founder-evidence-zip.js';

import { zipOne } from './helpers/founder-zip-fixture.mjs';

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
