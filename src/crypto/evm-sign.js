// Minimal EVM signing for the Worker (no dependency): keccak-256, secp256k1
// public key / address derivation and EIP-191 personal_sign with recovery id.
// Deterministic nonces (RFC 6979, HMAC-SHA256) and low-s signatures.

// ---- keccak-256 ------------------------------------------------------------
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M64 = (1n << 64n) - 1n;
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64);

function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    const c = [0, 1, 2, 3, 4].map(x => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
    }
    const b = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] = b[x + 5 * y] ^ (~b[(x + 1) % 5 + 5 * y] & M64 & b[(x + 2) % 5 + 5 * y]);
    s[0] ^= RC[round];
  }
}

export function keccak256(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let k = 7; k >= 0; k--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + k]);
      s[i] ^= lane;
    }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) out[i * 8 + k] = Number((s[i] >> BigInt(8 * k)) & 0xffn);
  return out;
}

// ---- secp256k1 -------------------------------------------------------------
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m = P) => ((a % m) + m) % m;
function inv(a, m = P) {
  let [lo, hi, x0, x1] = [mod(a, m), m, 1n, 0n];
  while (lo > 1n) { const q = hi / lo; [lo, hi] = [hi % lo, lo]; [x0, x1] = [x1 - q * x0, x0]; }
  return mod(x0, m);
}
// Jacobian coordinates
function dbl([x, y, z]) {
  if (y === 0n) return [0n, 1n, 0n];
  const a = mod(x * x), b = mod(y * y), c = mod(b * b);
  const d = mod(2n * (mod((x + b) ** 2n) - a - c));
  const e = mod(3n * a), f = mod(e * e);
  const x3 = mod(f - 2n * d);
  return [x3, mod(e * (d - x3) - 8n * c), mod(2n * y * z)];
}
function add(p, q) {
  if (p[2] === 0n) return q;
  if (q[2] === 0n) return p;
  const z1z1 = mod(p[2] * p[2]), z2z2 = mod(q[2] * q[2]);
  const u1 = mod(p[0] * z2z2), u2 = mod(q[0] * z1z1);
  const s1 = mod(p[1] * q[2] * z2z2), s2 = mod(q[1] * p[2] * z1z1);
  if (u1 === u2) return s1 === s2 ? dbl(p) : [0n, 1n, 0n];
  const h = mod(u2 - u1), r = mod(s2 - s1), hh = mod(h * h), hhh = mod(h * hh), v = mod(u1 * hh);
  const x3 = mod(r * r - hhh - 2n * v);
  return [x3, mod(r * (v - x3) - s1 * hhh), mod(p[2] * q[2] * h)];
}
function mul(k, point = G) {
  let r = [0n, 1n, 0n];
  let q = [point[0], point[1], 1n];
  for (let n = k; n > 0n; n >>= 1n) { if (n & 1n) r = add(r, q); q = dbl(q); }
  if (r[2] === 0n) return null;
  const zi = inv(r[2]), zi2 = mod(zi * zi);
  return [mod(r[0] * zi2), mod(r[1] * zi2 * zi)];
}

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const fromHex = h => { const s = String(h).replace(/^0x/, ''); const out = new Uint8Array(s.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16); return out; };
const toBig = bytes => BigInt('0x' + (hex(bytes) || '0'));
const to32 = n => fromHex(n.toString(16).padStart(64, '0'));

export function privateKeyToAddress(privateKey) {
  const d = toBig(typeof privateKey === 'string' ? fromHex(privateKey) : privateKey);
  if (d <= 0n || d >= N) throw new Error('EVM_PRIVATE_KEY_INVALID');
  const [x, y] = mul(d);
  const pub = new Uint8Array(64); pub.set(to32(x)); pub.set(to32(y), 32);
  return '0x' + hex(keccak256(pub).slice(12));
}

async function hmac(key, ...parts) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const len = parts.reduce((n, p) => n + p.length, 0);
  const data = new Uint8Array(len); let o = 0; for (const p of parts) { data.set(p, o); o += p.length; }
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** EIP-191 personal_sign: 0x{r}{s}{v} with v = 27/28. */
export async function personalSign(privateKey, message) {
  const msg = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const prefix = new TextEncoder().encode('\x19Ethereum Signed Message:\n' + msg.length);
  const full = new Uint8Array(prefix.length + msg.length); full.set(prefix); full.set(msg, prefix.length);
  const hash = keccak256(full);
  const keyBytes = typeof privateKey === 'string' ? fromHex(privateKey) : privateKey;
  const d = toBig(keyBytes);
  if (d <= 0n || d >= N) throw new Error('EVM_PRIVATE_KEY_INVALID');
  const z = mod(toBig(hash), N);
  // RFC 6979 deterministic k
  const x = to32(d), h1 = to32(z);
  let v = new Uint8Array(32).fill(1), k = new Uint8Array(32);
  k = await hmac(k, v, new Uint8Array([0]), x, h1); v = await hmac(k, v);
  k = await hmac(k, v, new Uint8Array([1]), x, h1); v = await hmac(k, v);
  for (;;) {
    v = await hmac(k, v);
    const kk = toBig(v);
    if (kk > 0n && kk < N) {
      const R = mul(kk);
      const r = mod(R[0], N);
      if (r !== 0n) {
        let s = mod(inv(kk, N) * (z + r * d), N);
        if (s !== 0n) {
          let recovery = Number(R[1] & 1n) | (R[0] >= N ? 2 : 0);
          if (s > N / 2n) { s = N - s; recovery ^= 1; }
          return '0x' + hex(to32(r)) + hex(to32(s)) + (27 + recovery).toString(16);
        }
      }
    }
    k = await hmac(k, v, new Uint8Array([0])); v = await hmac(k, v);
  }
}

function sqrtP(a) { // P ≡ 3 mod 4
  let r = 1n, b = mod(a), e = (P + 1n) / 4n;
  while (e > 0n) { if (e & 1n) r = mod(r * b); b = mod(b * b); e >>= 1n; }
  return r;
}

/** ecrecover for an EIP-191 message: the signer's address. */
export function recoverPersonalSignAddress(message, signature) {
  const msg = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const prefix = new TextEncoder().encode('\x19Ethereum Signed Message:\n' + msg.length);
  const full = new Uint8Array(prefix.length + msg.length); full.set(prefix); full.set(msg, prefix.length);
  const z = mod(toBig(keccak256(full)), N);
  const sig = fromHex(signature);
  const r = toBig(sig.slice(0, 32)), s = toBig(sig.slice(32, 64)), v = sig[64] >= 27 ? sig[64] - 27 : sig[64];
  const x = r + (v & 2 ? N : 0n);
  let y = sqrtP(mod(x * x * x + 7n));
  if ((y & 1n) !== BigInt(v & 1)) y = P - y;
  const ri = inv(r, N);
  const u1 = mod(-z * ri, N), u2 = mod(s * ri, N);
  const a = mul(u1), b = mul(u2, [x, y]);
  const j = add(a ? [a[0], a[1], 1n] : [0n, 1n, 0n], b ? [b[0], b[1], 1n] : [0n, 1n, 0n]);
  const zi = inv(j[2]), zi2 = mod(zi * zi);
  const pub = new Uint8Array(64); pub.set(to32(mod(j[0] * zi2))); pub.set(to32(mod(j[1] * zi2 * zi)), 32);
  return '0x' + hex(keccak256(pub).slice(12));
}

export const _internal = { fromHex, hex, N };
