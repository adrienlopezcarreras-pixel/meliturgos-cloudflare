function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createReleaseManifest({ commit, branch, lockfileHash, schemaVersion='unknown', configVersion='unknown', artifacts=[], healthChecks=[] }={}) {
  if (!commit || !branch) throw new Error('RELEASE_IDENTITY_REQUIRED');
  const body = stable({
    version: 1,
    commit: String(commit),
    branch: String(branch),
    lockfileHash: String(lockfileHash || ''),
    schemaVersion: String(schemaVersion),
    configVersion: String(configVersion),
    artifacts: artifacts.map(a => ({ path: String(a.path), sha256: String(a.sha256) })),
    healthChecks: healthChecks.map(String),
  });
  const manifestHash = await sha256(JSON.stringify(body));
  return { ...body, manifestHash };
}

export async function verifyReleaseManifest(manifest) {
  if (!manifest?.manifestHash || !manifest?.commit || !manifest?.branch) return { ok: false, code: 'MANIFEST_INCOMPLETE' };
  const { manifestHash, ...body } = manifest;
  const actual = await sha256(JSON.stringify(stable(body)));
  return actual === manifestHash ? { ok: true, commit: manifest.commit, branch: manifest.branch } : { ok: false, code: 'MANIFEST_TAMPERED', expected: manifestHash, actual };
}
