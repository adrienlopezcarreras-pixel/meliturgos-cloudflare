// Node-only pre-deploy backup writer. It preserves MEL_ENCRYPTED_BACKUP_V1
// while never allocating a giant plaintext, ciphertext or Base64 string.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { stableStringify } from '../../src/resilience/recovery-bundle.js';
import {
  ENCRYPTED_BACKUP_ALGORITHM,
  ENCRYPTED_BACKUP_SCHEMA,
  backupEnvelopeAAD,
} from '../../src/backup/encrypted-backup-storage.js';

const JSON_CHUNK_CHARS = 256 * 1024;
const IO_CHUNK_BYTES = 256 * 1024;
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;

function jsonValue(value, key) {
  return value && typeof value.toJSON === 'function' ? value.toJSON(key) : value;
}

function* jsonFragments(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') {
    const fragment = JSON.stringify(value);
    if (fragment === undefined) throw new Error('BACKUP_JSON_UNSUPPORTED_VALUE');
    yield fragment;
    return;
  }
  if (seen.has(value)) throw new Error('BACKUP_JSON_CIRCULAR');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      yield '[';
      for (let index = 0; index < value.length; index += 1) {
        if (index) yield ',';
        const item = jsonValue(value[index], String(index));
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
          yield 'null';
        } else {
          yield* jsonFragments(item, seen);
        }
      }
      yield ']';
    } else {
      yield '{';
      let first = true;
      for (const key of Object.keys(value)) {
        const item = jsonValue(value[key], key);
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
        if (!first) yield ',';
        first = false;
        yield JSON.stringify(key);
        yield ':';
        yield* jsonFragments(item, seen);
      }
      yield '}';
    }
  } finally {
    seen.delete(value);
  }
}

function* jsonUtf8Chunks(value) {
  let fragments = [];
  let length = 0;
  for (const fragment of jsonFragments(jsonValue(value, ''))) {
    if (length && length + fragment.length > JSON_CHUNK_CHARS) {
      yield Buffer.from(fragments.join(''), 'utf8');
      fragments = [];
      length = 0;
    }
    if (fragment.length > JSON_CHUNK_CHARS) {
      let start = 0;
      while (start < fragment.length) {
        let end = Math.min(fragment.length, start + JSON_CHUNK_CHARS);
        // Do not split an unpaired UTF-16 surrogate across two UTF-8 writes.
        if (end < fragment.length) {
          const last = fragment.charCodeAt(end - 1);
          if (last >= 0xd800 && last <= 0xdbff) end -= 1;
        }
        yield Buffer.from(fragment.slice(start, end), 'utf8');
        start = end;
      }
    } else {
      fragments.push(fragment);
      length += fragment.length;
    }
  }
  if (length) yield Buffer.from(fragments.join(''), 'utf8');
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, null);
    if (bytesWritten <= 0) throw new Error('BACKUP_ENCRYPTED_FILE_SHORT_WRITE');
    offset += bytesWritten;
  }
}

async function readExact(handle, position, expected) {
  const buffer = Buffer.alloc(expected.length);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, position + offset);
    if (!bytesRead) throw new Error('BACKUP_ENCRYPTED_FILE_TRUNCATED');
    offset += bytesRead;
  }
  if (!buffer.equals(expected)) throw new Error('BACKUP_ENCRYPTED_FILE_ENVELOPE_MISMATCH');
}

// Authenticate and independently decrypt the emitted file before it is
// uploaded. We never parse the huge JSON envelope into a V8 string.
async function verifyFile({ filePath, keyBytes, iv, aad, prefix, suffix, base64Length, plainHash, cipherHash }) {
  const size = (await stat(filePath)).size;
  if (size !== prefix.length + base64Length + suffix.length) {
    throw new Error('BACKUP_ENCRYPTED_FILE_LENGTH_MISMATCH');
  }
  const handle = await open(filePath, 'r');
  try {
    await readExact(handle, 0, prefix);
    await readExact(handle, prefix.length + base64Length, suffix);
  } finally {
    await handle.close();
  }

  const decipher = createDecipheriv('aes-256-gcm', keyBytes, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(Buffer.from(stableStringify(aad), 'utf8'));
  const encryptedDigest = createHash('sha256');
  const plaintextDigest = createHash('sha256');
  let partial = '';
  let tag = Buffer.alloc(0);

  const base64Stream = createReadStream(filePath, {
    start: prefix.length,
    end: prefix.length + base64Length - 1,
    highWaterMark: IO_CHUNK_BYTES,
  });
  for await (const bytes of base64Stream) {
    const ascii = partial + bytes.toString('ascii');
    if (/[^A-Za-z0-9+/=]/.test(ascii)) throw new Error('BACKUP_ENCRYPTED_FILE_BASE64_INVALID');
    const take = ascii.length - (ascii.length % 4);
    const decoded = Buffer.from(ascii.slice(0, take), 'base64');
    partial = ascii.slice(take);
    encryptedDigest.update(decoded);
    const combined = tag.length ? Buffer.concat([tag, decoded]) : decoded;
    if (combined.length > AUTH_TAG_BYTES) {
      const cut = combined.length - AUTH_TAG_BYTES;
      plaintextDigest.update(decipher.update(combined.subarray(0, cut)));
      tag = Buffer.from(combined.subarray(cut));
    } else {
      tag = Buffer.from(combined);
    }
  }
  if (partial.length || tag.length !== AUTH_TAG_BYTES) {
    throw new Error('BACKUP_ENCRYPTED_FILE_CIPHERTEXT_TRUNCATED');
  }
  if (encryptedDigest.digest('hex') !== cipherHash) {
    throw new Error('BACKUP_ENCRYPTED_FILE_CIPHERTEXT_HASH_MISMATCH');
  }
  decipher.setAuthTag(tag);
  plaintextDigest.update(decipher.final());
  if (plaintextDigest.digest('hex') !== plainHash) {
    throw new Error('BACKUP_ENCRYPTED_FILE_PLAINTEXT_HASH_MISMATCH');
  }
  return { ok: true, authenticated: true, ciphertext_sha256: cipherHash, plaintext_sha256: plainHash };
}

export async function writeVerifiedEncryptedBackupFile({
  snapshot, keyBytes, keyId, filePath, iv = randomBytes(IV_BYTES),
} = {}) {
  if (!snapshot?.id || !filePath || !keyId) throw new Error('BACKUP_STREAM_ARGUMENT_REQUIRED');
  if (!(keyBytes instanceof Uint8Array) || keyBytes.byteLength !== 32) {
    throw new Error('BACKUP_STREAM_AES256_KEY_REQUIRED');
  }
  if (!(iv instanceof Uint8Array) || iv.byteLength !== IV_BYTES) {
    throw new Error('BACKUP_STREAM_IV_INVALID');
  }
  const key = Buffer.from(keyBytes);
  const nonce = Buffer.from(iv);
  const aad = backupEnvelopeAAD(snapshot, keyId);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(Buffer.from(stableStringify(aad), 'utf8'));
  const plaintextDigest = createHash('sha256');
  const ciphertextDigest = createHash('sha256');
  const prefix = Buffer.from(
    JSON.stringify({ schema: ENCRYPTED_BACKUP_SCHEMA, algorithm: ENCRYPTED_BACKUP_ALGORITHM,
      key_id: keyId, iv_b64: nonce.toString('base64') }).slice(0, -1) + ',"ciphertext_b64":"',
    'utf8',
  );

  const handle = await open(filePath, 'wx', 0o600);
  let remainder = Buffer.alloc(0);
  let base64Length = 0;
  async function encodeCiphertext(bytes) {
    if (!bytes.length) return;
    ciphertextDigest.update(bytes);
    const combined = remainder.length ? Buffer.concat([remainder, bytes]) : bytes;
    const take = combined.length - (combined.length % 3);
    if (take) {
      const base64 = Buffer.from(combined.subarray(0, take).toString('base64'), 'ascii');
      await writeAll(handle, base64);
      base64Length += base64.length;
    }
    remainder = Buffer.from(combined.subarray(take));
  }

  let plainHash;
  let cipherHash;
  let suffix;
  try {
    await writeAll(handle, prefix);
    for (const chunk of jsonUtf8Chunks(snapshot)) {
      plaintextDigest.update(chunk);
      await encodeCiphertext(cipher.update(chunk));
    }
    await encodeCiphertext(cipher.final());
    // WebCrypto's AES-GCM representation stores the 16-byte tag after ciphertext.
    await encodeCiphertext(cipher.getAuthTag());
    if (remainder.length) {
      const tail = Buffer.from(remainder.toString('base64'), 'ascii');
      await writeAll(handle, tail);
      base64Length += tail.length;
    }
    plainHash = plaintextDigest.digest('hex');
    cipherHash = ciphertextDigest.digest('hex');
    suffix = Buffer.from('",' + JSON.stringify({
      plaintext_sha256: plainHash,
      ciphertext_sha256: cipherHash,
      aad,
    }).slice(1), 'utf8');
    await writeAll(handle, suffix);
  } finally {
    await handle.close();
  }
  const proof = await verifyFile({
    filePath, keyBytes: key, iv: nonce, aad, prefix, suffix,
    base64Length, plainHash, cipherHash,
  });
  return {
    bytes: (await stat(filePath)).size,
    plaintext_sha256: plainHash,
    ciphertext_sha256: cipherHash,
    verification: proof,
    base64_bytes: base64Length,
  };
}
