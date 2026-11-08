// One Workers-compatible transport for the three release/repair proof reads.
// No configurable host, redirects, raw exception details or partial approval.
const ROOT = 'https://api.github.com/repos/adrienlopezcarreras-pixel/meliturgos-cloudflare/';
const PATH = /^(?:actions\/runs\/[1-9][0-9]*(?:\/jobs\?per_page=100)?|compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40})$/;
export async function readRepairGitHubJson(path, { token, fetchImpl = fetch } = {}) {
  if (typeof path !== 'string' || !PATH.test(path) || typeof token !== 'string' || !token)
    return { ok: false, code: 'INPUT_INVALID' };
  let response;
  try {
    response = await fetchImpl(ROOT + path, {
      redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
        'user-agent': 'MEL-verified-repair-release' },
    });
  } catch { return { ok: false, code: 'FETCH_FAILED' }; }
  // Workers rejects redirect:error before sending. Manual mode instead exposes
  // every 3xx here and never sends this bearer to the Location destination.
  if (!response?.ok) return { ok: false, code: `HTTP_${Number(response?.status) || 0}` };
  try { return { ok: true, data: await response.json() }; }
  catch { return { ok: false, code: 'JSON_INVALID' }; }
}
