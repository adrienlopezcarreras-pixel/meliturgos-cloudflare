import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMemoryExportPayload,
  createMemoryExportResponse,
  memoryBackupKey,
  runScheduledMemoryBackup
} from '../src/persistence/memory-backup.js';
import { createWorkerEntrypoint } from '../src/worker-entry.js';

function mockDb(data) {
  return {
    prepare(query) {
      const table = /FROM\s+([a-z_]+)/i.exec(query)?.[1];
      return {
        bind(limit) {
          return {
            async all() {
              return { results: (data[table] || []).slice(0, limit) };
            }
          };
        }
      };
    }
  };
}

test('memory export and scheduled backup share the portable export format', async () => {
  const now = new Date('2026-09-16T12:34:56.000Z');
  const env = {
    MELITURGOS_USER: 'adrien',
    DB: mockDb({
      memories: [{ id: 1, content: 'm' }],
      conversations: [{ id: 2, title: 'c' }],
      archive_messages: [{ id: 3, content: 'a' }]
    })
  };
  const writes = [];
  env.MEDIA_BUCKET = {
    async head() { return null; },
    async put(key, body, options) { writes.push({ key, body, options }); }
  };

  const payload = await buildMemoryExportPayload(env, { now });
  assert.equal(payload.format, 'meliturgos-memory-export');
  assert.equal(payload.version, 1);
  assert.equal(payload.exported_at, now.toISOString());
  assert.deepEqual(payload.memories, [{ id: 1, content: 'm' }]);
  assert.deepEqual(payload.conversations, [{ id: 2, title: 'c' }]);
  assert.deepEqual(payload.archive_messages, [{ id: 3, content: 'a' }]);

  const response = await createMemoryExportResponse(env, { now });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /meliturgos-memory-2026-09-16\.json/);
  assert.deepEqual(await response.json(), payload);

  const result = await runScheduledMemoryBackup(env, { now });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.equal(result.key, 'backups/memory/2026-09-16.json');
  assert.equal(memoryBackupKey(now), result.key);
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0].body), payload);
  assert.equal(writes[0].options.httpMetadata.contentType, 'application/json; charset=utf-8');
});

test('scheduled backup is daily and idempotent', async () => {
  const now = new Date('2026-09-16T23:59:00.000Z');
  let puts = 0;
  const env = {
    DB: mockDb({}),
    MEDIA_BUCKET: {
      async head(key) { return { key }; },
      async put() { puts += 1; }
    }
  };

  const result = await runScheduledMemoryBackup(env, { now });
  assert.deepEqual(result, {
    ok: true,
    skipped: true,
    reason: 'ALREADY_BACKED_UP',
    key: 'backups/memory/2026-09-16.json'
  });
  assert.equal(puts, 0);
});

test('worker entrypoint preserves the autonomy scheduler while adding backup work', async () => {
  let baseScheduled = 0;
  let backupScheduled = 0;
  const registered = [];
  const baseWorker = {
    async fetch() { return new Response('delegated'); },
    async scheduled(_controller, _env, ctx) {
      baseScheduled += 1;
      ctx.waitUntil(Promise.resolve('autonomy'));
    }
  };
  const entrypoint = createWorkerEntrypoint(baseWorker, {
    backupRunner: async () => {
      backupScheduled += 1;
      return { ok: true };
    }
  });
  const ctx = { waitUntil(promise) { registered.push(Promise.resolve(promise)); } };

  await entrypoint.scheduled({}, {}, ctx);
  await Promise.all(registered);

  assert.equal(baseScheduled, 1);
  assert.equal(backupScheduled, 1);
  assert.equal(registered.length, 2);
});

test('/api/export is served by the shared exporter instead of the legacy handler', async () => {
  let delegated = false;
  const baseWorker = {
    async fetch() {
      delegated = true;
      return new Response('legacy');
    }
  };
  const entrypoint = createWorkerEntrypoint(baseWorker);
  const auth = Buffer.from('adrien:secret', 'utf8').toString('base64');
  const request = new Request('https://mel.example/api/export', {
    headers: { Authorization: `Basic ${auth}` }
  });
  const env = {
    MELITURGOS_USER: 'adrien',
    MELITURGOS_PASSWORD: 'secret',
    DB: mockDb({ memories: [], conversations: [], archive_messages: [] })
  };

  const response = await entrypoint.fetch(request, env, {});
  assert.equal(response.status, 200);
  assert.equal(delegated, false);
  assert.equal((await response.json()).format, 'meliturgos-memory-export');
});
