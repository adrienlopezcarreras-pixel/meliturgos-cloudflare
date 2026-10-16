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
  constructor({ ttlMs = 5 * 60_000, maxEntries = 256 } = {}) {
    this.ttlMs = ttlMs;
    // Keep the in-memory AI response cache bounded in long-lived Workers.
    // Map insertion order is the LRU ordering (oldest first).
    this.maxEntries = Number.isSafeInteger(maxEntries)
      ? Math.max(1, Math.min(1024, maxEntries)) : 256;
    this.entries = new Map();
  }

  async key(input) {
    return sha256(stableStringify(input));
  }

  async get(input) {
    const key = await this.key(input);
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      this.entries.delete(key);
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
      if (entry.expiresAt <= now) this.entries.delete(storedKey);
    }
    this.entries.delete(key);
    if (Number.isFinite(ttlMs) && ttlMs > 0) {
      this.entries.set(key, { value: structuredClone(value), expiresAt: now + ttlMs });
      while (this.entries.size > this.maxEntries) {
        this.entries.delete(this.entries.keys().next().value);
      }
    }
    return key;
  }
}
