// Diagnostic only: inspect the Cloudflare D1 list for the configured account.
// Never create or mutate a database, or log account IDs, tokens, or database names.
export async function probePreviewD1List({ accountId, databaseId, apiToken, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/i.test(String(accountId || '')) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(databaseId || '')) ||
      !String(apiToken || '').trim()) {
    return 'PREVIEW_D1_LIST_INPUT_INVALID';
  }
  let response;
  try {
    response = await fetchImpl(
      'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/d1/database?per_page=10000',
      { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + apiToken, Accept: 'application/json' } },
    );
  } catch {
    return 'PREVIEW_D1_LIST_NETWORK_FAILED';
  }
  let body;
  try { body = await response.json(); } catch { return 'PREVIEW_D1_LIST_RESPONSE_INVALID'; }
  const codes = Array.isArray(body?.errors) ? body.errors.map(x => Number(x?.code)) : [];
  if (response.status === 401 || response.status === 403 || codes.includes(7403)) {
    return 'PREVIEW_D1_LIST_ACCESS_DENIED';
  }
  if (!response.ok || body?.success !== true || !Array.isArray(body?.result)) {
    return 'PREVIEW_D1_LIST_RESPONSE_INVALID';
  }
  const target = String(databaseId).toLowerCase();
  if (body.result.some(db => String(db?.uuid || '').toLowerCase() === target)) {
    return 'PREVIEW_D1_LIST_MATCH_VERIFIED';
  }
  const total = Number(body?.result_info?.total_count);
  if (!Number.isSafeInteger(total) || total > body.result.length) {
    return 'PREVIEW_D1_LIST_INCOMPLETE';
  }
  return 'PREVIEW_D1_LIST_TARGET_NOT_IN_ACCOUNT';
}
