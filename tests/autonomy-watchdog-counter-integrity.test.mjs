import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAutonomyProgressWatchdog } from '../src/evolution/autonomy-progress-watchdog.js';

test('malformed persisted watchdog counters do not hide stalled work', async () => {
  let saved;
  const db = { prepare: () => ({ bind: (...args) => ({
    first: async () => ({status:'NO_PROGRESS',last_seen:1,metadata_json:JSON.stringify({
      consecutive_stalls:'NaN',
      counters:{ticks:'Infinity',advanced_ticks:'-Infinity',jobs_created:'bad',jobs_completed:-4,blocked_ticks:'NaN',lease_busy_skips:1.5},
    })}),
    run: async () => { saved=JSON.parse(args[3]); return {success:true}; },
  }) }) };
  const state=await recordAutonomyProgressWatchdog(db,{status:'NO_PROGRESS',advanced:false,progress:{work_remaining:true,waiting_external:false}},{maxAutonomy:true,now:1000});
  assert.equal(state.consecutive_stalls,1);
  assert.deepEqual(state.counters,{ticks:1,advanced_ticks:0,jobs_created:0,jobs_completed:0,blocked_ticks:1,lease_busy_skips:1});
  assert.deepEqual(saved.counters,state.counters);
});
