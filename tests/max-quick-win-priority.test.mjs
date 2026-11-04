import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { isMaxQuickWin, selectNextAutonomyItem, AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';

const canonical = flattenRoadmap();
const byId = id => {
  const item = canonical.find(row => row.id === id);
  assert.ok(item, 'missing canonical roadmap entry ' + id);
  return item;
};

test('quick-first selects a genuinely bounded independent task, not critical backup or Council code', () => {
  assert.equal(isMaxQuickWin(byId('MEL-UI-AUDIT-01')), true);
  for (const id of ['MEL-FOUNDER-07', 'MEL-FOUNDER-04', 'MEL-FOUNDER-02', 'MEL-FOUNDER-08']) {
    assert.equal(isMaxQuickWin(byId(id)), false, id + ' is not a quick win');
  }
  assert.equal(selectNextAutonomyItem({ roadmap: canonical, quickWinsFirst: true })?.id, 'MEL-UI-AUDIT-01');
  assert.equal(selectNextAutonomyItem({ roadmap: canonical, quickWinsFirst: false })?.id, 'MEL-FOUNDER-01',
    'legacy foundation-first ordering remains available for explicit consumers');
});

test('quick-first never jumps ahead of a missing verified software prerequisite', () => {
  const work = [byId('MEL-FOUNDER-07'), byId('MEL-CHAT-04')];
  assert.equal(isMaxQuickWin(work[1]), true);
  assert.equal(selectNextAutonomyItem({ roadmap: work, quickWinsFirst: true })?.id, 'MEL-FOUNDER-07',
    'Founder-01 is not verified; a small downstream item must stay blocked');
  assert.equal(selectNextAutonomyItem({ roadmap: work, quickWinsFirst: true,
    completedIds: ['MEL-FOUNDER-01'] })?.id, 'MEL-FOUNDER-07',
    'COMPLETED alone is not proof for a downstream mission');
  assert.equal(selectNextAutonomyItem({ roadmap: work, quickWinsFirst: true,
    verifiedIds: ['MEL-FOUNDER-01'] })?.id, 'MEL-CHAT-04');
});

test('short-first filters external acceptance, unsafe paths and unbounded contracts', () => {
  const good = byId('MEL-UI-AUDIT-01');
  for (const changed of [
    { ...good, external_acceptance: { status: 'BLOCKED_EXTERNAL' } },
    { ...good, verify_existing: false },
    { ...good, mode: 'EXTERNAL' },
    { ...good, code_paths: ['src/backup/restore-service.js'] },
    { ...good, code_paths: [...good.code_paths, 'src/backup/restore-service.js'] },
    { ...good, test_paths: ['../other.test.mjs'] },
    { ...good, test_paths: [] },
    { ...good, acceptance: [] },
  ]) assert.equal(isMaxQuickWin(changed), false, JSON.stringify(changed));
});

test('quick-first respects exclusions and falls back to existing ranked backlog when no quick work remains', () => {
  const work = [byId('MEL-FOUNDER-07'), byId('MEL-UI-AUDIT-01')];
  assert.equal(selectNextAutonomyItem({ roadmap: work, quickWinsFirst: true,
    activeIds: ['MEL-UI-AUDIT-01'] })?.id, 'MEL-FOUNDER-07');
  assert.equal(selectNextAutonomyItem({ roadmap: work, quickWinsFirst: true,
    completedIds: ['MEL-UI-AUDIT-01'] })?.id, 'MEL-FOUNDER-07');
  assert.equal(selectNextAutonomyItem({ roadmap: work, quickWinsFirst: true,
    blockedIds: ['MEL-UI-AUDIT-01'] })?.id, 'MEL-FOUNDER-07');
});

test('one existing Teacher-approved mission retains the single slot despite a new quick win', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const created = await repository.create({
    id: 'mel-autonomy-founder-07-active',
    requested_by: 'mel-autonomy',
    goal: '[MEL-FOUNDER-07] restore safely',
    optional_context: { roadmap_id: 'MEL-FOUNDER-07', source: 'autonomy-supervisor' },
  });
  await repository.update(created.id, { status: 'TEACHER_APPROVED' });
  const supervisor = new AutonomySupervisor({
    repository, quickWinsFirst: true,
    roadmap: [byId('MEL-FOUNDER-07'), byId('MEL-UI-AUDIT-01')],
  });
  assert.equal((await supervisor.state()).next.id, 'MEL-UI-AUDIT-01',
    'the next independent candidate is visible but does not preempt the current mission');
  const next = await supervisor.ensureNextJob();
  assert.equal(next.created, false);
  assert.equal(next.job?.id, created.id);
  assert.equal((await repository.list()).length, 1,
    'no speculative second D1 job while an unfinished mission owns the slot');
});
