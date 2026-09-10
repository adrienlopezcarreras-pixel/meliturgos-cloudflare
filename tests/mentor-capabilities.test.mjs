import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function context() {
  return { owner: 'test-owner', permissions: [], requestId: crypto.randomUUID() };
}

test('Gen2 runtime registers Mentor capabilities with truthful risk and health', () => {
  const runtime = createGen2Runtime({ env: {} });
  const byId = new Map(runtime.bus.list().map(row => [row.id, row]));
  for (const id of ['mentor.propose', 'mentor.learn', 'mentor.recent']) {
    assert.ok(byId.has(id), `missing ${id}`);
  }
  assert.equal(byId.get('mentor.propose').risk, 'MEDIUM');
  assert.equal(byId.get('mentor.learn').risk, 'MEDIUM');
  assert.equal(byId.get('mentor.recent').risk, 'LOW');
  assert.equal(byId.get('mentor.propose').health, 'DEGRADED');
});

test('mentor.learn persists a bounded lesson that mentor.recent can read back', async () => {
  const DB = sqliteD1();
  try {
    const runtime = createGen2Runtime({ env: { DB } });
    const learned = await runtime.bus.execute('mentor.learn', {
      jobId: 'job-capability-1',
      goal: 'Rendre MEL autonome',
      outcome: 'SUCCEEDED',
      lesson: 'Après un changement du bridge, exécuter les tests ciblés puis la suite complète.',
      evidence: { tests: ['test:integration'] },
      score: 1,
      tags: ['bridge', 'regression'],
    }, context());
    assert.equal(learned.job_id, 'job-capability-1');
    assert.equal(learned.outcome, 'SUCCEEDED');

    const rows = await runtime.bus.execute('mentor.recent', { limit: 10 }, context());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].job_id, 'job-capability-1');
    assert.match(rows[0].lesson, /tests ciblés/i);

    const migration = await DB.prepare('SELECT version,name FROM schema_migrations WHERE version=6').first();
    assert.equal(migration.version, 6);
    assert.equal(migration.name, 'mentor_learning_memory');
  } finally {
    DB.close();
  }
});

test('mentor.propose fails closed when no AI binding is available', async () => {
  const DB = sqliteD1();
  try {
    const runtime = createGen2Runtime({ env: { DB } });
    await assert.rejects(
      () => runtime.bus.execute('mentor.propose', {
        goal: 'Corriger un module',
        inspectedFiles: [{ path: 'src/example.js', content: 'export const ok = false;\n' }],
      }, context()),
      error => error.code === 'AI_BINDING_MISSING'
    );
  } finally {
    DB.close();
  }
});
