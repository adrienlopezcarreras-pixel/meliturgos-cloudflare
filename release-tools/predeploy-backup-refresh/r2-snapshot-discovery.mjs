// Discover an existing encrypted R2 snapshot without downloading private data,
// displaying R2 keys or changing production state. An object listing is NOT a
// restoration proof: the isolated restore runner must decrypt and verify bytes.
export const ENCRYPTED_SNAPSHOT_KEY = /^backups\/system\/[A-Za-z0-9._-]+\.enc\.json$/;
const MAX_LIST_BYTES = 2 * 1024 * 1024;
// Same default freshness window as the release-backup gate; a historical
// manual restore may still supply an exact object key explicitly.
export const DEFAULT_AUTO_RESTORE_MAX_AGE_MS = 26 * 60 * 60 * 1000;
const fail = code => { throw Object.assign(new Error(code), {code}); };

async function boundedListJson(response) {
  if (!response?.ok) fail(response?.status === 401 || response?.status === 403
    ? 'ISOLATED_R2_LIST_ACCESS_DENIED' : 'ISOLATED_R2_LIST_FAILED');
  const size = Number(response.headers?.get?.('content-length') || 0);
  if (size > MAX_LIST_BYTES) fail('ISOLATED_R2_LIST_BODY_TOO_LARGE');
  if (!response.body) fail('ISOLATED_R2_LIST_BODY_UNAVAILABLE');
  const parts = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_LIST_BYTES) fail('ISOLATED_R2_LIST_BODY_TOO_LARGE');
    parts.push(chunk);
  }
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(
    Buffer.concat(parts.map(part => Buffer.from(part)), total))); }
  catch { fail('ISOLATED_R2_LIST_RESPONSE_INVALID'); }
  if (value?.success !== true || !Array.isArray(value?.result)
    || !value?.result_info || typeof value.result_info !== 'object')
    fail('ISOLATED_R2_LIST_RESPONSE_INVALID');
  return value;
}

export async function discoverLatestEncryptedSnapshotKey({
  accountId, apiToken, bucket = 'meliturgos-private-media',
  fetchImpl = fetch, maxPages = 50,
  now = Date.now(), maxAgeMs = DEFAULT_AUTO_RESTORE_MAX_AGE_MS,
} = {}) {
  if (!/^[a-f0-9]{32}$/i.test(String(accountId || ''))
      || !String(apiToken || '').trim()
      || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(String(bucket))
      || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100
      || !Number.isFinite(now) || !Number.isSafeInteger(maxAgeMs)
      || maxAgeMs <= 0 || maxAgeMs > 7 * 24 * 60 * 60 * 1000)
    fail('ISOLATED_R2_LIST_CONFIG_INVALID');
  const endpoint = new URL('https://api.cloudflare.com/client/v4/accounts/'
    + accountId + '/r2/buckets/' + bucket + '/objects');
  endpoint.searchParams.set('prefix', 'backups/system/');
  endpoint.searchParams.set('per_page', '100');
  const seenCursors = new Set();
  let cursor = '';
  let best = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(endpoint);
    if (cursor) url.searchParams.set('cursor', cursor);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET', redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {authorization: 'Bearer ' + apiToken},
      });
    } catch { fail('ISOLATED_R2_LIST_TRANSPORT_FAILED'); }
    const data = await boundedListJson(response);
    for (const row of data.result) {
      const key = row?.key;
      const modified = Date.parse(String(row?.last_modified || ''));
      if (typeof key !== 'string' || !ENCRYPTED_SNAPSHOT_KEY.test(key)
          || !Number.isInteger(row?.size) || row.size <= 0
          || row.size > 512 * 1024 * 1024 || !Number.isFinite(modified)
          || modified > now + 5 * 60_000) continue;
      if (!best || modified > best.modified
          || (modified === best.modified && key > best.key))
        best = {key, modified};
    }
    const info = data.result_info;
    if (info.is_truncated !== true) {
      if (!best) fail('ISOLATED_R2_SNAPSHOT_NOT_FOUND');
      if (best.modified < now - maxAgeMs || best.modified > now)
        fail('ISOLATED_R2_SNAPSHOT_STALE');
      return best.key;
    }
    const next = String(info.cursor || '');
    if (!next || seenCursors.has(next) || next.length > 8192)
      fail('ISOLATED_R2_LIST_CURSOR_INVALID');
    seenCursors.add(next);
    cursor = next;
  }
  // Never select from an incomplete listing: a newer object may exist.
  fail('ISOLATED_R2_LIST_PAGE_LIMIT');
}

/**
 * R2 last_modified belongs to the encrypted object, not to the backup's
 * underlying content. A freshly copied old snapshot must never qualify as
 * an automatic recent recovery. Historical explicit restores remain allowed.
 */
export function requireFreshDecryptedSnapshot(snapshot, {
  now = Date.now(), maxAgeMs = DEFAULT_AUTO_RESTORE_MAX_AGE_MS,
} = {}) {
  if (!Number.isFinite(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0
      || maxAgeMs > 7 * 24 * 60 * 60 * 1000)
    fail('ISOLATED_R2_SNAPSHOT_FRESHNESS_CONFIG_INVALID');
  const createdAt = snapshot?.createdAt;
  if (typeof createdAt !== 'string'
      || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$/.test(createdAt))
    fail('ISOLATED_R2_SNAPSHOT_TIMESTAMP_INVALID');
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created) || created > now || created < now - maxAgeMs)
    fail('ISOLATED_R2_SNAPSHOT_STALE');
  return true;
}
