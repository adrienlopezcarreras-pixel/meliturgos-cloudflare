// Read existing preview bindings only; never create resources or inspect secrets.
export async function resolvePreviewBindings({ config, env = process.env, fetchImpl = fetch }) {
  let d1 = String(env.MEL_PREVIEW_D1_DATABASE_ID || '').trim();
  let bucket = String(env.MEL_PREVIEW_R2_BUCKET || '').trim();
  if (d1 && bucket) return { d1, bucket };
  const script = config.env?.preview?.name || `${config.name}-preview`;
  if (config.name !== 'meliturgos' || script !== 'meliturgos-preview' ||
      config.env?.preview?.vars?.MEL_PREVIEW_ISOLATED !== 'true') {
    throw Error('PREVIEW_DISCOVERY_TARGET_INVALID');
  }
  const account = String(env.CLOUDFLARE_ACCOUNT_ID || '');
  const token = String(env.CLOUDFLARE_API_TOKEN || '');
  if (!/^[a-f0-9]{32}$/i.test(account) || !token) {
    throw Error('PREVIEW_DISCOVERY_CREDENTIALS_MISSING');
  }
  let response;
  try {
    response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${script}/settings`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch { throw Error('PREVIEW_DISCOVERY_REQUEST_FAILED'); }
  if (!response.ok) throw Error(`PREVIEW_DISCOVERY_HTTP_${response.status}`);
  let data;
  try { data = await response.json(); } catch { throw Error('PREVIEW_DISCOVERY_RESPONSE_INVALID'); }
  const bindings = data?.result?.bindings;
  if (data?.success !== true || !Array.isArray(bindings)) throw Error('PREVIEW_DISCOVERY_RESPONSE_INVALID');
  const dbs = bindings.filter(x => x.name === 'DB' && x.type === 'd1');
  const buckets = bindings.filter(x => x.name === 'MEDIA_BUCKET' && x.type === 'r2_bucket');
  if ((!d1 && dbs.length !== 1) || (!bucket && buckets.length !== 1)) {
    throw Error('PREVIEW_DISCOVERY_BINDINGS_MISSING_OR_AMBIGUOUS');
  }
  if (!d1) {
    if (dbs[0].id && dbs[0].database_id && dbs[0].id !== dbs[0].database_id) {
      throw Error('PREVIEW_DISCOVERY_D1_ID_CONFLICT');
    }
    d1 = String(dbs[0].id || dbs[0].database_id || '');
  }
  if (!bucket) bucket = String(buckets[0].bucket_name || '');
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(d1) ||
      !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket)) throw Error('PREVIEW_DISCOVERY_IDENTITIES_INVALID');
  if (config.d1_databases?.some(x => String(x.database_id).toLowerCase() === d1.toLowerCase()) ||
      config.r2_buckets?.some(x => x.bucket_name === bucket)) throw Error('PREVIEW_DISCOVERY_PRODUCTION_RESOURCE_FORBIDDEN');
  return { d1, bucket };
}
