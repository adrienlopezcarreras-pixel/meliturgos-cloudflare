// Inspect a bounded STORE-only ZIP from GitHub Actions. Compression level 0
// is selected by the producer. Reject traversal, extra files and comments.
// GitHub writes its artifact archives with a data descriptor (flag 0x08): the
// local header then carries zero CRC and sizes, the real values follow the
// data and are repeated in the central directory. Production 30/10: rejecting
// that flag refused every real artifact (MISSION_TEST_GITHUB_LOOKUP_FAILED at
// ARCHIVE_PARSE) and kept FOUNDER-01 unverified.
const NAME = 'founder-mission-test-evidence.json';
const DESCRIPTOR_FLAG = 0x08;

export function decodeFounderEvidenceZip(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 30 + 46 + 22 || bytes.length > 256 * 1024) throw new Error('MISSION_TEST_ZIP_SIZE_INVALID');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const utf8 = (from, to) => new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(from, to));

  // End of central directory: exactly one entry, no archive comment.
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50
      || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0
      || view.getUint16(end + 8, true) !== 1 || view.getUint16(end + 10, true) !== 1
      || view.getUint16(end + 20, true) !== 0) {
    throw new Error('MISSION_TEST_ZIP_DIRECTORY_INVALID');
  }
  const center = view.getUint32(end + 16, true);
  const centerSize = view.getUint32(end + 12, true);
  if (center + centerSize !== end || center + 46 > end) throw new Error('MISSION_TEST_ZIP_DIRECTORY_INVALID');

  // Central directory: the authoritative CRC and sizes.
  if (view.getUint32(center, true) !== 0x02014b50) throw new Error('MISSION_TEST_ZIP_CENTRAL_INVALID');
  const flags = view.getUint16(center + 8, true);
  const crc = view.getUint32(center + 16, true);
  const packed = view.getUint32(center + 20, true);
  const unpacked = view.getUint32(center + 24, true);
  const nameLength = view.getUint16(center + 28, true);
  if ((flags !== 0 && flags !== DESCRIPTOR_FLAG) || view.getUint16(center + 10, true) !== 0
      || packed !== unpacked || packed > 128 * 1024
      || view.getUint16(center + 30, true) !== 0 || view.getUint16(center + 32, true) !== 0
      || view.getUint32(center + 42, true) !== 0
      || center + 46 + nameLength !== end
      || utf8(center + 46, center + 46 + nameLength) !== NAME) {
    throw new Error('MISSION_TEST_ZIP_CENTRAL_INVALID');
  }

  // Local header: same entry, same flags, no compression, no extra field.
  if (view.getUint32(0, true) !== 0x04034b50) throw new Error('MISSION_TEST_ZIP_INVALID');
  const localNameLength = view.getUint16(26, true);
  const start = 30 + localNameLength + view.getUint16(28, true);
  if (view.getUint16(6, true) !== flags || view.getUint16(8, true) !== 0
      || view.getUint32(10, true) !== view.getUint32(center + 12, true)
      || localNameLength !== nameLength || view.getUint16(28, true) !== 0
      || start + packed > center || utf8(30, 30 + nameLength) !== NAME) {
    throw new Error('MISSION_TEST_ZIP_UNSUPPORTED');
  }
  const local = [view.getUint32(14, true), view.getUint32(18, true), view.getUint32(22, true)];
  let dataEnd = start + packed;
  if (flags === DESCRIPTOR_FLAG) {
    // Local values are zero or already final; the descriptor must match.
    if (local.some((value, i) => value !== 0 && value !== [crc, packed, unpacked][i])) throw new Error('MISSION_TEST_ZIP_UNSUPPORTED');
    let at = dataEnd;
    if (at + 4 <= center && view.getUint32(at, true) === 0x08074b50) at += 4;
    if (at + 12 > center || view.getUint32(at, true) !== crc
        || view.getUint32(at + 4, true) !== packed || view.getUint32(at + 8, true) !== unpacked) {
      throw new Error('MISSION_TEST_ZIP_DESCRIPTOR_INVALID');
    }
    dataEnd = at + 12;
  } else if (local[0] !== crc || local[1] !== packed || local[2] !== unpacked) {
    throw new Error('MISSION_TEST_ZIP_UNSUPPORTED');
  }
  // Nothing hidden between the sole file and the central directory.
  if (dataEnd !== center) throw new Error('MISSION_TEST_ZIP_CENTRAL_INVALID');

  const data = bytes.subarray(start, start + packed);
  let sum = 0xffffffff;
  for (const value of data) {
    sum ^= value;
    for (let bit = 0; bit < 8; bit++) sum = (sum >>> 1) ^ ((sum & 1) ? 0xedb88320 : 0);
  }
  if (((sum ^ 0xffffffff) >>> 0) !== crc) throw new Error('MISSION_TEST_ZIP_CRC_INVALID');
  return JSON.parse(utf8(start, start + packed));
}
