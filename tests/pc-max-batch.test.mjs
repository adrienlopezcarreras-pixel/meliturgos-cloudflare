import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMoreOnPc, PC_DEVELOPMENTS_PER_TICK } from '../src/evolution/autonomy-runtime.js';

const ready = async () => ({ ok: true, device_id: 'pc' });
const offline = async () => ({ ok: false });

test('without the PC, a tick still does one development', async () => {
  let calls = 0;
  const result = await advanceMoreOnPc({
    env: {},
    ready: offline,
    seed: { progress: { work_remaining: true, advanced: true, job_id: 'a' } },
    run: async () => { calls += 1; return { progress: { advanced: true } }; },
  });
  assert.equal(result.ran, 1);
  assert.equal(calls, 0);
});

test('with the PC on, one tick continues until the cap', async () => {
  let n = 0;
  const result = await advanceMoreOnPc({
    env: {},
    ready,
    seed: { progress: { work_remaining: true, advanced: true, job_id: 'a' } },
    run: async () => {
      n += 1;
      return { advanced: true, progress: { advanced: true, work_remaining: true, job_id: 'job-' + n } };
    },
  });
  assert.equal(result.ran, PC_DEVELOPMENTS_PER_TICK);
  assert.equal(n, PC_DEVELOPMENTS_PER_TICK - 1);
});

test('one additional distinct PC job runs with the seeded job per tick', async () => {
  const seen = [];
  const result = await advanceMoreOnPc({
    env: {},
    ready,
    seed: { progress: { work_remaining: true, advanced: true } },
    selectJobs: async () => ['job-a', 'job-b', 'job-c'],
    run: async ({ onlyJobId }) => {
      seen.push(onlyJobId);
      return { progress: { advanced: true, job_id: onlyJobId, work_remaining: true } };
    },
  });
  assert.equal(result.parallel, true);
  assert.deepEqual(seen, ['job-a']);
  assert.equal(result.ran, 2);
});

test('a tick stops when the next development does not advance and names no job', async () => {
  const result = await advanceMoreOnPc({
    env: {},
    ready,
    seed: { progress: { work_remaining: true, advanced: true } },
    run: async () => ({ advanced: false, progress: { advanced: false, work_remaining: true } }),
  });
  assert.equal(result.ran, 2);
});
