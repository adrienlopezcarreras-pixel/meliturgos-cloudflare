import test from 'node:test';
import assert from 'node:assert/strict';
import { exportD1 } from '../release-tools/predeploy-backup-refresh/d1-export.mjs';

test('a page too heavy for D1 memory is retried smaller instead of blocking every release', async () => {
  const rows = Array.from({ length: 1200 }, (_, id) => ({ id }));
  const asked = [];
  const sidecarJson = async (_sidecar, path) => {
    if (path === '/d1/tables') return { status: 'D1_TABLES', tables: [{ name: 'dev_jobs' }] };
    const url = new URL(path, 'http://x');
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    asked.push(limit);
    if (limit > 100) throw new Error('SIDECAR_HTTP_503:PREDEPLOY_BACKUP_SIDECAR_FAILED:D1_ERROR: Memory limit exceeded before EOF.');
    const page = rows.slice(offset, offset + limit);
    return { status: 'D1_ROWS_PAGE', table: 'dev_jobs', rows: page, offset, limit, has_more: offset + limit < rows.length };
  };
  const out = await exportD1({}, sidecarJson);
  assert.equal(out.tables[0].rowCount, 1200);
  assert.deepEqual(out.tables[0].rows.map(r => r.id), rows.map(r => r.id));
  assert.deepEqual(asked.slice(0, 3), [500, 250, 125]);
  assert.ok(asked.slice(3).every(limit => limit === 62));
});

test('other sidecar failures still stop the backup', async () => {
  const sidecarJson = async (_s, path) => {
    if (path === '/d1/tables') return { status: 'D1_TABLES', tables: [{ name: 't' }] };
    throw new Error('SIDECAR_HTTP_500:FAILED:boom');
  };
  await assert.rejects(() => exportD1({}, sidecarJson), /boom/);
});
