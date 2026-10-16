function stableStringify(value, active = new WeakSet()) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    if (Object.is(value, -0)) return '-0';
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') return `${value}n`;
  // Non-data types cannot safely identify a cached request.
  if (typeof value !== 'object' || active.has(value)) {
    throw new TypeError('AUGMENTIO_CACHE_KEY_UNSUPPORTED');
  }
  active.add(value);
  try {
    if (Array.isArray(value)) {
      // Array.map() skips holes: [] and [undefined] previously hashed alike.
      return `[${Array.from({ length: value.length }, (_, i) =>
        Object.hasOwn(value, i) ? stableStringify(value[i], active) : 'hole').join(',')}]`;
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new TypeError('AUGMENTIO_CACHE_KEY_UNSUPPORTED');
      return `date(${JSON.stringify(value.toISOString())})`;
    }
    if (value instanceof URL) return `url(${JSON.stringify(value.href)})`;
    if (value instanceof Map) {
      return `map(${[...value].map(([k, v]) =>
        `[${stableStringify(k, active)},${stableStringify(v, active)}]`).join(',')})`;
    }
    if (value instanceof Set) {
      return `set(${[...value].map(v => stableStringify(v, active)).sort().join(',')})`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('AUGMENTIO_CACHE_KEY_UNSUPPORTED');
    }
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify(value[key], active)}`).join(',')}}`;
  } finally {
    active.delete(value);
  }
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class ComputeCache {
  constructor({
    ttlMs = 5 * 60_000, maxEntries = 256,
    maxBytes = 8 * 1024 * 1024, maxEntryBytes = 2 * 1024 * 1024,
  } = {}) {
    this.ttlMs = ttlMs;
    // Entry count alone is insufficient: a large fan-out can occupy
    // megabytes. Bound total serialized response bytes in a long-lived Worker.
    this.maxEntries = Number.isSafeInteger(maxEntries)
      ? Math.max(1, Math.min(1024, maxEntries)) : 256;
    this.maxBytes = Number.isSafeInteger(maxBytes)
      ? Math.max(1024, Math.min(32 * 1024 * 1024, maxBytes)) : 8 * 1024 * 1024;
    this.maxEntryBytes = Number.isSafeInteger(maxEntryBytes)
      ? Math.max(128, Math.min(this.maxBytes, maxEntryBytes))
      : Math.min(this.maxBytes, 2 * 1024 * 1024);
    this.entries = new Map();
    this.totalBytes = 0;
  }

  deleteKey(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.totalBytes = Math.max(0, this.totalBytes - (entry.bytes || 0));
    return this.entries.delete(key);
  }

  async key(input) {
    return sha256(stableStringify(input));
  }

  async get(input) {
    const key = await this.key(input);
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      this.deleteKey(key);
      return null;
    }
    // Refresh recency only for unexpired cache hits.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return structuredClone(hit.value);
  }

  async set(input, value, ttlMs = this.ttlMs) {
    const key = await this.key(input);
    const now = Date.now();
    // Expired entries should not accumulate if requests never reuse them.
    for (const [storedKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.deleteKey(storedKey);
    }
    this.deleteKey(key);
    if (Number.isFinite(ttlMs) && ttlMs > 0) {
      // A non-JSON/circular output cannot be safely sized: skip the cache
      // rather than failing the caller's otherwise valid AI response.
      let serialized;
      try { serialized = JSON.stringify(value); } catch { return key; }
      if (typeof serialized !== 'string') return key;
      const bytes = Math.max(
        new TextEncoder().encode(serialized).byteLength,
        serialized.length * 2,
      );
      if (bytes > this.maxEntryBytes) return key;
      const copy = structuredClone(value);
      this.entries.set(key, { value: copy, expiresAt: now + ttlMs, bytes });
      this.totalBytes += bytes;
      while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
        this.deleteKey(this.entries.keys().next().value);
      }
    }
    return key;
  }
}
