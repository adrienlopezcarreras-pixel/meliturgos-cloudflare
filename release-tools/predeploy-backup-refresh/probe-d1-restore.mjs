// Owner-run diagnostic: SELECT-only production reads, disposable local restore.
// No raw schemas, rows, credentials, or Cloudflare error messages leave memory.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { exportD1 } from './d1-export.mjs';
import { proveD1SnapshotRestore } from './d1-restore-proof.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';

export async function probeD1Restore({ accountId, apiToken, databaseId, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '') || !apiToken
      || !/^[a-f0-9-]{36}$/.test(databaseId || '')) fail('RESTORE_PROBE_CREDENTIALS_REQUIRED');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const overall = AbortSignal.timeout(8 * 60_000);
  async function select(sql, params = []) {
    if (!/^SELECT\s/i.test(sql)) fail('RESTORE_PROBE_SELECT_REQUIRED');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.any([overall, AbortSignal.timeout(60_000)]),
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    if (!response.ok) fail('RESTORE_PROBE_QUERY_HTTP_FAILED');
    const payload = await response.json();
    const result = payload?.result?.[0];
    if (payload?.success !== true || result?.success === false || !Array.isArray(result?.results)) {
      fail('RESTORE_PROBE_QUERY_FAILED');
    }
    return result.results;
  }
  const tables = (await select("SELECT name, sql AS schema FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
    .filter(table => table.name && !String(table.name).startsWith('_cf_'));
  const names = new Set(tables.map(table => table.name));
  const snapshot = await exportD1(null, async (_sidecar, path) => {
    if (path === '/d1/tables') return { status: 'D1_TABLES', tables };
    const url = new URL(path, 'https://readonly.invalid');
    const table = url.searchParams.get('table');
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    if (!names.has(table) || table.length > 160 || !Number.isInteger(offset) || offset < 0
        || !Number.isInteger(limit) || limit < 1 || limit > 500) fail('RESTORE_PROBE_PAGE_INVALID');
    let rows;
    try {
      rows = await select(`SELECT * FROM ${quote(table)} ORDER BY rowid LIMIT ? OFFSET ?`, [limit, offset]);
    } catch {
      rows = await select(`SELECT * FROM ${quote(table)} LIMIT ? OFFSET ?`, [limit, offset]);
    }
    return { status: 'D1_ROWS_PAGE', table, offset, limit, rows, has_more: rows.length === limit };
  });
  return proveD1SnapshotRestore(snapshot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
    const proof = await probeD1Restore({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      databaseId: config.d1_databases.find(entry => entry.binding === 'DB')?.database_id,
    });
    process.stdout.write(JSON.stringify(proof) + '\n');
  } catch (error) {
    const code = /^(?:RESTORE_PROBE|BACKUP_SQLITE)_[A-Z_]+$/.test(error?.code || '')
      ? error.code : 'RESTORE_PROBE_FAILED';
    process.stdout.write(JSON.stringify({
      ok: false, code, production_written: false,
      ...(error?.diagnostic ? { restore_diagnostic: error.diagnostic } : {}),
    }) + '\n');
    process.exitCode = 1;
  }
}
