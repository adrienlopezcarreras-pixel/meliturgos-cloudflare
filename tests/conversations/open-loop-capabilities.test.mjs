import test from 'node:test';
import assert from 'node:assert/strict';

import { registerOpenLoopCapabilities } from '../../src/capabilities/open-loop-capabilities.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

function fakeBus() {
  const handlers = new Map();
  return {
    discover(descriptor, handler) { handlers.set(descriptor.id, { descriptor, handler }); },
    async execute(id, input, context) {
      const row = handlers.get(id);
      if (!row) throw new Error('CAPABILITY_NOT_FOUND:'+id);
      return row.handler(input, context);
    },
    handlers,
  };
}

test('open-loop capabilities capture and list only the current owner', async () => {
  const DB = sqliteD1();
  const bus = fakeBus();
  registerOpenLoopCapabilities(bus, { env: { DB, MELITURGOS_USER: 'adrien' } });
  try {
    const first = await bus.execute('openloop.capture', {
      taskId: 'work-a',
      conversationId: 'conv-a',
      sourceEventId: 'event-1',
      priority: 7,
      nextAction: 'continue work',
      resumeAt: 0,
      metadata: { workDagId: 'work-a' },
    }, { owner: 'adrien' });

    const duplicate = await bus.execute('openloop.capture', {
      taskId: 'work-a',
      conversationId: 'conv-a',
      sourceEventId: 'event-1',
      nextAction: 'must not overwrite',
    }, { owner: 'adrien' });

    assert.equal(first.id, 'conv-a::work-a');
    assert.equal(duplicate.nextAction, 'continue work');

    const due = await bus.execute('openloop.due', { limit: 10 }, { owner: 'adrien' });
    assert.equal(due.count, 1);
    assert.equal(due.loops[0].owner, 'adrien');

    const other = await bus.execute('openloop.due', { limit: 10 }, { owner: 'other' });
    assert.equal(other.count, 0);
  } finally {
    DB.close();
  }
});

test('openloop.resume claims once and resumes the linked Work DAG through work.run', async () => {
  const DB = sqliteD1();
  const bus = fakeBus();
  let workRuns = 0;
  bus.discover({ id: 'work.run' }, async ({ id }) => {
    workRuns += 1;
    assert.equal(id, 'work-42');
    return { status: 'COMPLETED', id };
  });
  registerOpenLoopCapabilities(bus, { env: { DB, MELITURGOS_USER: 'adrien' } });

  try {
    await bus.execute('openloop.capture', {
      taskId: 'task-42',
      conversationId: 'conv-42',
      status: 'resumable',
      resumeAt: 0,
      metadata: { workDagId: 'work-42' },
    }, { owner: 'adrien' });

    const first = await bus.execute('openloop.resume', { limit: 5 }, { owner: 'adrien' });
    assert.equal(first.attempted, 1);
    assert.equal(first.succeeded, 1);
    assert.equal(workRuns, 1);

    const second = await bus.execute('openloop.resume', { limit: 5 }, { owner: 'adrien' });
    assert.equal(second.attempted, 0);
    assert.equal(workRuns, 1);
  } finally {
    DB.close();
  }
});

test('openloop.resume keeps a loop resumable when no Work DAG can be resolved', async () => {
  const DB = sqliteD1();
  const bus = fakeBus();
  registerOpenLoopCapabilities(bus, { env: { DB, MELITURGOS_USER: 'adrien' } });
  try {
    await bus.execute('openloop.capture', {
      taskId: 'task-no-work',
      conversationId: 'conv-no-work',
      status: 'resumable',
      resumeAt: 0,
      metadata: { workDagId: '' },
    }, { owner: 'adrien' });

    const result = await bus.execute('openloop.resume', { limit: 1 }, { owner: 'adrien' });
    assert.equal(result.attempted, 1);
    assert.equal(result.failed, 0);

    const dueNow = await bus.execute('openloop.due', { limit: 10 }, { owner: 'adrien' });
    assert.equal(dueNow.count, 0);
  } finally {
    DB.close();
  }
});
