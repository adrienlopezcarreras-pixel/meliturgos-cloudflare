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

// GitHub Actions artifact archives use a data descriptor (flag 0x08): zero CRC
// and sizes in the local header, real values after the data. Production 30/10:
// rejecting them kept FOUNDER-01 at MISSION_TEST_GITHUB_LOOKUP_FAILED.
function zipWithDescriptor(name, doc, { signature = true } = {}) {
  const data = new TextEncoder().encode(JSON.stringify(doc));
  const file = new TextEncoder().encode(name);
  let crc = 0xffffffff;
  for (const value of data) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const descriptor = signature ? 16 : 12;
  const center = 30 + file.length + data.length + descriptor;
  const out = new Uint8Array(center + 46 + file.length + 22);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 8, true); v.setUint32(10, 0x5b6e6a40, true);
  v.setUint16(26, file.length, true); out.set(file, 30); out.set(data, 30 + file.length);
  let at = 30 + file.length + data.length;
  if (signature) { v.setUint32(at, 0x08074b50, true); at += 4; }
  v.setUint32(at, crc, true); v.setUint32(at + 4, data.length, true); v.setUint32(at + 8, data.length, true);
  v.setUint32(center, 0x02014b50, true); v.setUint16(center + 4, 20, true); v.setUint16(center + 6, 20, true); v.setUint16(center + 8, 8, true);
  v.setUint32(center + 12, 0x5b6e6a40, true); v.setUint32(center + 16, crc, true); v.setUint32(center + 20, data.length, true); v.setUint32(center + 24, data.length, true);
  v.setUint16(center + 28, file.length, true); out.set(file, center + 46);
  const end = center + 46 + file.length;
  v.setUint32(end, 0x06054b50, true); v.setUint16(end + 8, 1, true); v.setUint16(end + 10, 1, true);
  v.setUint32(end + 12, 46 + file.length, true); v.setUint32(end + 16, center, true);
  return out;
}

test('Founder ZIP reader accepts the data-descriptor archives GitHub Actions produces', () => {
  const doc = { schema: 'MEL_FOUNDER_MISSION_TEST_EVIDENCE_V1', exit_code: 0 };
  assert.deepEqual(decodeFounderEvidenceZip(zipWithDescriptor('founder-mission-test-evidence.json', doc).buffer), doc);
  assert.deepEqual(decodeFounderEvidenceZip(zipWithDescriptor('founder-mission-test-evidence.json', doc, { signature: false }).buffer), doc);
});

test('Founder ZIP reader still rejects a forged descriptor, CRC or extra entry name', () => {
  const doc = { ok: true };
  const badDescriptor = zipWithDescriptor('founder-mission-test-evidence.json', doc);
  const size = JSON.stringify(doc).length;
  new DataView(badDescriptor.buffer).setUint32(30 + 34 + size + 8, size + 1, true);
  assert.throws(() => decodeFounderEvidenceZip(badDescriptor.buffer));
  const corrupt = zipWithDescriptor('founder-mission-test-evidence.json', doc);
  corrupt[30 + 34] ^= 1;
  assert.throws(() => decodeFounderEvidenceZip(corrupt.buffer), /CRC/);
  assert.throws(() => decodeFounderEvidenceZip(zipWithDescriptor('other.json', doc).buffer));
});
