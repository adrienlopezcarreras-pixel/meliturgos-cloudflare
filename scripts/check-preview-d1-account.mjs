// Fail-closed, read-only Cloudflare D1 access preflight for isolated MEL preview.
// Never writes migrations, creates resources, or prints credentials/resource identities.
export async function checkPreviewD1Access({ accountId, databaseId, apiToken, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/i.test(String(accountId || '')) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(databaseId || '')) ||
      !String(apiToken || '').trim()) {
    return { ok: false, code: 'PREVIEW_D1_PREFLIGHT_INPUT_INVALID' };
  }
  let response;
  try {
    response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`,
      { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' } },
    );
  } catch {
    return { ok: false, code: 'PREVIEW_D1_PREFLIGHT_NETWORK_FAILED' };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, code: 'PREVIEW_D1_ACCOUNT_OR_TOKEN_UNAUTHORIZED' };
  }
  let body;
  try { body = await response.json(); } catch {
    return { ok: false, code: 'PREVIEW_D1_PREFLIGHT_RESPONSE_INVALID' };
  }
  const cfCodes = Array.isArray(body?.errors) ? body.errors.map(e => Number(e?.code)) : [];
  if (cfCodes.includes(7403)) {
    return { ok: false, code: 'PREVIEW_D1_ACCOUNT_OR_TOKEN_UNAUTHORIZED' };
  }
  if (!response.ok || body?.success !== true) {
    return { ok: false, code: 'PREVIEW_D1_PREFLIGHT_REJECTED' };
  }
  if (String(body?.result?.uuid || body?.result?.id || '').toLowerCase() !==
      String(databaseId).toLowerCase()) {
    return { ok: false, code: 'PREVIEW_D1_IDENTITY_MISMATCH' };
  }
  return { ok: true, code: 'PREVIEW_D1_READ_ACCESS_VERIFIED' };
}
