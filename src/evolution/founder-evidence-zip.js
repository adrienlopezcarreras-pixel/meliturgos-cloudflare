// Inspect a bounded STORE-only ZIP from GitHub Actions. Compression level 0
// is selected by the producer. Reject descriptors, traversal and extra files.
export function decodeFounderEvidenceZip(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 30 || bytes.length > 256 * 1024) throw new Error('MISSION_TEST_ZIP_SIZE_INVALID');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x04034b50) throw new Error('MISSION_TEST_ZIP_INVALID');
  const flags = view.getUint16(6, true), method = view.getUint16(8, true);
  const packed = view.getUint32(18, true), unpacked = view.getUint32(22, true);
  const nameLength = view.getUint16(26, true), extraLength = view.getUint16(28, true);
  const start = 30 + nameLength + extraLength;
  const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(30, 30 + nameLength));
  if (flags & 0x0009 || method !== 0 || packed !== unpacked || packed > 128 * 1024
      || name !== 'founder-mission-test-evidence.json' || start + packed > bytes.length) {
    throw new Error('MISSION_TEST_ZIP_UNSUPPORTED');
  }
  // ZIP Central Directory must immediately follow the sole file. Never read
  // a ZIP with unseen extra entries or rely on untrusted archive paths.
  const center = start + packed;
  if (center + 46 > bytes.length || view.getUint32(center, true) !== 0x02014b50
      || view.getUint16(center + 10, true) !== 0 || view.getUint32(center + 20, true) !== packed
      || view.getUint32(center + 24, true) !== unpacked
      || view.getUint16(center + 28, true) !== nameLength
      || new TextDecoder().decode(bytes.subarray(center + 46, center + 46 + nameLength)) !== name) {
    throw new Error('MISSION_TEST_ZIP_CENTRAL_INVALID');
  }
  const centralEnd = center + 46 + nameLength + view.getUint16(center + 30, true) + view.getUint16(center + 32, true);
  if (view.getUint32(center + 42, true) !== 0 || centralEnd + 22 !== bytes.length
      || view.getUint32(centralEnd, true) !== 0x06054b50
      || view.getUint16(centralEnd + 8, true) !== 1
      || view.getUint16(centralEnd + 10, true) !== 1
      || view.getUint16(centralEnd + 20, true) !== 0)
    throw new Error('MISSION_TEST_ZIP_DIRECTORY_INVALID');
  let crc = 0xffffffff;
  for (const value of bytes.subarray(start, center)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(14, true)
      || view.getUint32(center + 16, true) !== view.getUint32(14, true))
    throw new Error('MISSION_TEST_ZIP_CRC_INVALID');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, center)));
}
