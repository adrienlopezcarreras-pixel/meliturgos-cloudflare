import test from 'node:test';
import assert from 'node:assert/strict';
import { AutonomySupervisor, selectNextAutonomyItem } from '../src/evolution/autonomy-supervisor.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { unmetSoftwarePrerequisites } from '../src/evolution/own-roadmap-advance.js';

test('a human or external parent is not a software prerequisite', () => {
  const roadmap = [
    { id: 'DEVICE', status: 'PLANNED', external_acceptance: { status: 'BLOCKED_EXTERNAL' }, depends_on: [] },
    { id: 'CLOUD', status: 'PLANNED', depends_on: ['DEVICE', 'BASE'] },
    { id: 'BASE', status: 'DONE_VERIFIED', depends_on: [] },
  ];
  assert.deepEqual(unmetSoftwarePrerequisites(roadmap[1], roadmap), []);
  assert.equal(selectNextAutonomyItem({ roadmap, blockedIds: ['BASE'] }).id, 'CLOUD');
});

test('three failed model attempts do not hide a prepared package', () => {
  const roadmap = [
    { id: 'MEL-FOUNDER-01', status: 'IN_PROGRESS', priority: 'P0', depends_on: [] },
    { id: 'MEL-FOUNDER-02', status: 'IN_PROGRESS', priority: 'P0', depends_on: [] },
  ];
  const blocked = ['MEL-FOUNDER-01', 'MEL-FOUNDER-02'];
  assert.equal(selectNextAutonomyItem({ roadmap, blockedIds: blocked }).id, 'MEL-FOUNDER-02');
  assert.equal(selectNextAutonomyItem({
    roadmap: [{ id: 'MEL-FOUNDER-01', status: 'IN_PROGRESS', priority: 'P0', depends_on: [] }],
    blockedIds: ['MEL-FOUNDER-01'],
  }), null);
});

test('a prepared package whose software parent is still open stays parked', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const result = await new AutonomySupervisor({ repository, roadmap: [
    { id: 'MEL-FOUNDER-02', status: 'IN_PROGRESS', priority: 'P0', depends_on: [] },
    { id: 'MEL-MANIFEST-01', status: 'PLANNED', priority: 'P0', depends_on: ['MEL-FOUNDER-02'] },
  ], }).ensureNextJob();
  assert.equal(result.created, true);
  assert.equal(result.job.optional_context.roadmap_id, 'MEL-FOUNDER-02');
  assert.notEqual(result.external_progress?.status, 'ROADMAP_PREREQUISITES_PENDING');
});
