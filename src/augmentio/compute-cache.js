function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class ComputeCache {
  constructor({ ttlMs = 5 * 60_000 } = {}) {
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  async key(input) {
    return sha256(stableStringify(input));
  }

  async get(input) {
    const key = await this.key(input);
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return structuredClone(hit.value);
  }

  async set(input, value, ttlMs = this.ttlMs) {
    const key = await this.key(input);
    this.entries.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttlMs });
    return key;
  }
}
