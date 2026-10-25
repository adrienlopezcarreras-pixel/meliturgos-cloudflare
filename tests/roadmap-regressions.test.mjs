import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { recordRoadmapRegressions, activeRoadmapRegressions, roadmapIdsInText } from '../src/roadmap/roadmap-regressions.js';
import { AutonomySupervisor, setRuntimeRoadmapRegressions } from '../src/evolution/autonomy-supervisor.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';

test('roadmap ids are read from a failing test file', () => {
  assert.deepEqual(roadmapIdsInText("test('[MEL-FOUNDER-01] x GEN2-42', () => {}) // MEL-FOUNDER-01"), ['MEL-FOUNDER-01', 'GEN2-42']);
});

test('a regressed item stays open until a job for it completes after the regression', async () => {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE dev_bridge_state (bridge_id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL, status TEXT, metadata_json TEXT NOT NULL DEFAULT \'{}\')').run();
  const repo = new D1DevJobRepository(db);
  await repo.init();
  await recordRoadmapRegressions(db, ['MEL-FOUNDER-01', 'not-an-id'], { now: 1000 });
  assert.deepEqual(await activeRoadmapRegressions(db), ['MEL-FOUNDER-01']);
  await repo.create({ id: 'j', goal: 'g', requested_by: 'mel-autonomy', optional_context: { roadmap_id: 'MEL-FOUNDER-01' } });
  await db.prepare("UPDATE dev_jobs SET status='COMPLETED', created_at=2000 WHERE id='j'").run();
  assert.deepEqual(await activeRoadmapRegressions(db), []);
});

test('the supervisor reopens a regressed item', () => {
  setRuntimeRoadmapRegressions(['MEL-FOUNDER-01']);
  const supervisor = new AutonomySupervisor({ repository: { list: async () => [], create: async () => null } });
  assert.equal(supervisor.roadmap.find(item => item.id === 'MEL-FOUNDER-01')?.status, 'REGRESSED');
  setRuntimeRoadmapRegressions([]);
});
