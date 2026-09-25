import test from 'node:test';
import assert from 'node:assert/strict';

import { CoreRestartSnapshot, capabilityWorkReader } from '../src/core/restart-snapshot.js';
import { D1OpenLoopRestartReader } from '../src/conversations/d1-open-loop-restart-reader.js';

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = compact(sql); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    if (this.sql.startsWith('CREATE TABLE')) return { success: true, meta: { changes: 0 } };
    throw new Error(`UNEXPECTED_SQL_RUN:${this.sql}`);
  }
  async all() {
    if (!this.sql.includes('FROM mel_open_loops')) throw new Error(`UNEXPECTED_SQL_ALL:${this.sql}`);
    const [owner, limit] = this.args;
    const active = new Set(['open','waiting','resumable','failed','resuming']);
    const rows = this.db.loops
      .filter(row => row.owner === owner && active.has(row.status))
      .sort((a, b) =>
        (b.priority - a.priority)
        || (a.resume_at - b.resume_at)
        || (b.updated_at - a.updated_at)
      )
      .slice(0, limit);
    return { results: structuredClone(rows) };
  }
}

class FakeD1 {
  constructor(loops = []) { this.loops = structuredClone(loops); }
  prepare(sql) { return new FakeStatement(this, sql); }
}

function loop(overrides = {}) {
  return {
    id: 'conv-1::task-1',
    owner: 'adrien',
    task_id: 'task-1',
    conversation_id: 'conv-1',
    status: 'resumable',
    priority: 5,
    next_action: 'Continue the task',
    resume_at: 0,
    checkpoint_json: JSON.stringify({ step: 3 }),
    metadata_json: JSON.stringify({ kind: 'generic' }),
    updated_at: 9_000,
    lease_until: null,
    ...overrides,
  };
}

function dependencies({ loops = [loop()] } = {}) {
  const work = [
    { id: 'work-running', job_id: 'job-running', status: 'RUNNING', created_at: 1_000, updated_at: 8_000 },
    { id: 'work-waiting', job_id: 'job-waiting', status: 'WAITING', created_at: 2_000, updated_at: 7_000 },
  ];
  const projects = [
    { project_id: 'p-active', title: 'Active', objectives: ['Ship'], status: 'ACTIVE', created_at: 1_000, updated_at: 8_500, metadata: {} },
    { project_id: 'p-paused', title: 'Paused', objectives: ['Resume'], status: 'PAUSED', created_at: 2_000, updated_at: 7_500, metadata: {} },
    { project_id: 'p-complete', title: 'Done', objectives: ['Done'], status: 'COMPLETED', created_at: 3_000, updated_at: 9_500, metadata: {} },
  ];
  const decisions = [
    { decision_id: 'd1', project_id: 'p-active', title: 'Use D1', rationale: 'Durable', status: 'ADOPTED', decided_at: 6_000, updated_at: 6_000, source: 'owner', confidence: 1 },
  ];
  const lessons = [
    { lesson_id: 'l1', project_id: 'p-active', content: 'Keep integrations idempotent', learned_at: 6_500, source: 'runtime' },
  ];
  const timeline = [
    { event_id: 't1', type: 'work.completed', title: 'Previous work', description: 'Done', occurred_at: 5_000, source: 'work-engine', confidence: 1, metadata: {} },
  ];

  return {
    work,
    projects,
    decisions,
    lessons,
    timeline,
    workReader: { open: async () => ({ work: structuredClone(work) }) },
    openLoopReader: new D1OpenLoopRestartReader(new FakeD1(loops)),
    planning: {
      listProjects: async () => structuredClone(projects),
      listDecisions: async () => structuredClone(decisions),
      listLessons: async () => structuredClone(lessons),
    },
    timelineReader: { list: async () => structuredClone(timeline) },
  };
}

test('restart snapshot reconstructs actionable durable state without executing work', async () => {
  const deps = dependencies();
  let workExecutions = 0;
  deps.workReader.open = async () => {
    workExecutions += 1;
    return { work: structuredClone(deps.work) };
  };

  const snapshot = await new CoreRestartSnapshot({
    workReader: deps.workReader,
    openLoopReader: deps.openLoopReader,
    planning: deps.planning,
    timeline: deps.timelineReader,
    now: () => 10_000,
  }).build({ owner: 'adrien' });

  assert.equal(workExecutions, 1);
  assert.equal(snapshot.schema, 'mel.restart-snapshot/v1');
  assert.equal(snapshot.generated_at, 10_000);
  assert.equal(snapshot.counts.open_work, 2);
  assert.equal(snapshot.counts.open_loops, 1);
  assert.equal(snapshot.counts.active_projects, 2);
  assert.deepEqual(snapshot.active_projects.map(row => row.project_id), ['p-active', 'p-paused']);
  assert.deepEqual(snapshot.recent_decisions.map(row => row.decision_id), ['d1']);
  assert.deepEqual(snapshot.recent_lessons.map(row => row.lesson_id), ['l1']);
  assert.deepEqual(snapshot.recent_timeline.map(row => row.event_id), ['t1']);
});

test('restart snapshot resume queue prioritizes explicit open-loop priority before Work rows', async () => {
  const deps = dependencies({
    loops: [
      loop({ id: 'high', task_id: 'high', priority: 50, status: 'waiting', updated_at: 3_000 }),
      loop({ id: 'ready', task_id: 'ready', priority: 10, status: 'resumable', updated_at: 4_000 }),
    ],
  });

  const snapshot = await new CoreRestartSnapshot({
    workReader: deps.workReader,
    openLoopReader: deps.openLoopReader,
    planning: deps.planning,
    timeline: deps.timelineReader,
    now: () => 10_000,
  }).build({ owner: 'adrien' });

  assert.equal(snapshot.resume_queue[0].id, 'high');
  assert.equal(snapshot.resume_queue[1].id, 'ready');
  assert.equal(snapshot.resume_queue.some(row => row.id === 'work-running'), true);
});

test('D1 restart reader never leaks open loops from another owner', async () => {
  const reader = new D1OpenLoopRestartReader(new FakeD1([
    loop({ id: 'mine', owner: 'adrien' }),
    loop({ id: 'foreign', owner: 'someone-else', task_id: 'foreign', conversation_id: 'conv-foreign' }),
    loop({ id: 'done', owner: 'adrien', status: 'completed' }),
  ]));

  const rows = await reader.listActive({ owner: 'adrien' });
  assert.deepEqual(rows.map(row => row.id), ['mine']);
});

test('restart snapshot returns defensive compact copies', async () => {
  const deps = dependencies();
  const snapshot = await new CoreRestartSnapshot({
    workReader: deps.workReader,
    openLoopReader: deps.openLoopReader,
    planning: deps.planning,
    timeline: deps.timelineReader,
  }).build({ owner: 'adrien' });

  snapshot.open_loops[0].checkpoint.step = 999;
  snapshot.active_projects[0].objectives[0] = 'mutated';

  assert.equal(deps.projects[0].objectives[0], 'Ship');
  const reread = await deps.openLoopReader.listActive({ owner: 'adrien' });
  assert.equal(reread[0].checkpoint.step, 3);
});

test('restart snapshot fails closed without owner and capabilityWorkReader uses work.open only', async () => {
  const calls = [];
  const reader = capabilityWorkReader({
    execute: async (id, input, context) => {
      calls.push({ id, input, context });
      return { work: [] };
    },
  }, { owner: 'adrien', requestId: 'restart-test' });

  await reader.open({ limit: 5 });
  assert.deepEqual(calls, [{
    id: 'work.open',
    input: { limit: 5 },
    context: { owner: 'adrien', requestId: 'restart-test' },
  }]);

  const deps = dependencies();
  const builder = new CoreRestartSnapshot({
    workReader: deps.workReader,
    openLoopReader: deps.openLoopReader,
    planning: deps.planning,
    timeline: deps.timelineReader,
  });
  await assert.rejects(() => builder.build({ owner: '' }), /RESTART_OWNER_REQUIRED/);
});
