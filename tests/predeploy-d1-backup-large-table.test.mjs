import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exportD1, D1_PAGE_SIZE, MAX_ROWS_PER_TABLE } from '../release-tools/predeploy-backup-refresh/d1-export.mjs';

function fakeSidecar({ count = 0, shortPage = false } = {}) {
  const requests = [];
  const reader = async (_sidecar, path) => {
    requests.push(path);
    if (path === '/d1/tables') return {
      ok: true, status: 'D1_TABLES',
      tables: [
        { name: '_cf_KV', schema: null },
        { name: 'audit_logs', schema: 'CREATE TABLE audit_logs (id INTEGER PRIMARY KEY)' },
        { name: 'other', schema: 'CREATE TABLE other (id INTEGER)' },
      ],
    };
    const u = new URL(path, 'https://sidecar.test');
    const table = u.searchParams.get('table');
    const offset = Number(u.searchParams.get('offset'));
    const limit = Number(u.searchParams.get('limit'));
    if (table !== 'audit_logs' && table !== 'other') throw new Error('Unexpected table');
    const total = table === 'audit_logs' ? count : 1;
    const n = Math.min(limit, Math.max(0, total - offset));
    const rows = Array.from({ length: n }, (_, i) => ({ id: offset + i + 1 }));
    return {
      ok: true, status: 'D1_ROWS_PAGE', table, offset, limit, rows,
      has_more: shortPage ? true : rows.length === limit,
    };
  };
  return { reader, requests };
}

test('predeploy D1 export keeps all 50,001 audit log rows and includes other tables', async () => {
  const { reader, requests } = fakeSidecar({ count: 50_001 });
  const result = await exportD1({}, reader);
  assert.equal(D1_PAGE_SIZE, 500);
  assert.equal(MAX_ROWS_PER_TABLE, 250_000);
  assert.deepEqual(result.tables.map(x => x.name), ['audit_logs', 'other']);
  assert.equal(result.tables[0].rowCount, 50_001);
  assert.equal(result.tables[0].rows.at(-1).id, 50_001);
  assert.equal(result.tables[1].rowCount, 1);
  assert.ok(requests.some(x => x.includes('offset=50000')));
  assert.equal(requests.filter(x => x.includes('table=_cf_KV')).length, 0);
});

test('predeploy D1 export refuses overflow rather than returning partial data', async () => {
  const { reader } = fakeSidecar({ count: 1501 });
  await assert.rejects(
    () => exportD1({}, reader, { maxRowsPerTable: 1500 }),
    /BACKUP_TABLE_ROW_LIMIT:audit_logs/,
  );
});

test('predeploy export rejects malformed pages and cannot silently truncate', async () => {
  const { reader } = fakeSidecar({ count: 1 });
  await assert.rejects(
    () => exportD1({}, async (sidecar, path) => {
      const d = await reader(sidecar, path);
      return d?.status === 'D1_ROWS_PAGE' ? { ...d, offset: 9000 } : d;
    }),
    /D1_ROWS_PAGE_INVALID:audit_logs/,
  );
  const broken = fakeSidecar({ count: 1, shortPage: true });
  await assert.rejects(() => exportD1({}, broken.reader), /D1_PAGINATION_STALLED:audit_logs/);
});

test('250k is an upper bound consistent with sidecar offset policy', async () => {
  const sidecar = await readFile(new URL('../release-tools/predeploy-backup-refresh/worker.js', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../release-tools/predeploy-backup-refresh/runner.mjs', import.meta.url), 'utf8');
  assert.match(sidecar, /safeOffset > 250_000/);
  assert.match(runner, /database: \(\) => exportD1\(sidecar, sidecarJson\)/);
  assert.ok(MAX_ROWS_PER_TABLE <= 250_000);
});
