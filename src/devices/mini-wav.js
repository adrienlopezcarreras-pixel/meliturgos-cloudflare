// The MINI plays only 48 kHz, mono, 16-bit PCM, with a plain fmt+data WAV.
// Anything else is refused by the firmware and she stays silent.

const RATE = 48000;
const MAX_SECONDS = 20;

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function parsePcm(bytes) {
  if (bytes.length < 44 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return null;
  if (bytes[8] !== 0x57 || bytes[9] !== 0x41 || bytes[10] !== 0x56 || bytes[11] !== 0x45) return null;
  let offset = 12;
  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let data = null;
  for (let n = 0; n < 12 && offset + 8 <= bytes.length; n += 1) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = u32(bytes, offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) return null;
    if (id === 'fmt ') {
      if (size < 16) return null;
      format = u16(bytes, start);
      channels = u16(bytes, start + 2);
      rate = u32(bytes, start + 4);
      bits = u16(bytes, start + 14);
    } else if (id === 'data') {
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size & 1);
  }
  if (format !== 1 || (channels !== 1 && channels !== 2) || bits !== 16 || !rate || !data || data.length < 2) return null;
  const samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2));
  return { rate, channels, samples };
}

function mono(samples, channels) {
  if (channels === 1) return samples;
  const out = new Int16Array(Math.floor(samples.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = (samples[i * 2] + samples[i * 2 + 1]) >> 1;
  return out;
}

function resample(samples, from, to) {
  if (from === to) return samples;
  const count = Math.min(MAX_SECONDS * to, Math.max(1, Math.round(samples.length * to / from)));
  const out = new Int16Array(count);
  const last = samples.length - 1;
  for (let i = 0; i < count; i += 1) {
    const pos = i * from / to;
    const left = Math.min(last, Math.floor(pos));
    const right = Math.min(last, left + 1);
    const frac = pos - left;
    out[i] = samples[left] + (samples[right] - samples[left]) * frac;
  }
  return out;
}

function encode(samples) {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 36 + dataBytes, true);
  bytes.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i += 1) view.setInt16(44 + i * 2, samples[i], true);
  return bytes;
}

export function toMiniWav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  const parsed = parsePcm(bytes);
  if (!parsed) return null;
  const one = mono(parsed.samples, parsed.channels);
  return encode(resample(one, parsed.rate, RATE));
}
