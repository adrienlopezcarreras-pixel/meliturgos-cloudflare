import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordAutonomyProgressWatchdog,
  readAutonomyProgressWatchdog,
  resetAutonomyProgressWatchdog,
} from '../src/evolution/autonomy-progress-watchdog.js';

class MemoryD1 {
  constructor(){ this.rows=new Map(); }
  prepare(sql){
    const db=this;
    return {
      bind(...args){
        return {
          async first(){
            if (/SELECT status,metadata_json,last_seen FROM dev_bridge_state/i.test(sql)) {
              const row=db.rows.get(args[0]);
              return row ? { ...row } : null;
            }
            return null;
          },
          async run(){
            if (/INSERT INTO dev_bridge_state/i.test(sql)) {
              const [bridge_id,last_seen,status,metadata_json]=args;
              db.rows.set(bridge_id,{last_seen,status,metadata_json});
              return {meta:{changes:1}};
            }
            return {meta:{changes:0}};
          },
        };
      },
    };
  }
}

function stalledTick(reason='NO_PROGRESS'){
  return {
    advanced:false,
    status:'NO_PROGRESS',
    progress:{
      advanced:false,
      events:[],
      work_remaining:true,
      waiting_external:false,
      block_reason:reason,
      active_jobs:1,
      job_id:'job-1',
      job_status:'QUEUED',
    },
  };
}

test('MAX watchdog trips only after repeated measurable no-progress cycles', async()=>{
  const db=new MemoryD1();
  const one=await recordAutonomyProgressWatchdog(db,stalledTick(),{maxAutonomy:true,now:1000});
  const two=await recordAutonomyProgressWatchdog(db,stalledTick(),{maxAutonomy:true,now:2000});
  const three=await recordAutonomyProgressWatchdog(db,stalledTick(),{maxAutonomy:true,now:3000});
  assert.equal(one.tripped,false);
  assert.equal(two.tripped,false);
  assert.equal(three.tripped,true);
  assert.equal(three.status,'STALLED');
  assert.equal(three.consecutive_stalls,3);
  assert.equal(three.counters.blocked_ticks,3);
});

test('real progress resets the stall streak and increments useful counters', async()=>{
  const db=new MemoryD1();
  await recordAutonomyProgressWatchdog(db,stalledTick(),{maxAutonomy:true,now:1000});
  const progress=await recordAutonomyProgressWatchdog(db,{
    advanced:true,
    progress:{
      advanced:true,
      events:['JOB_CREATED','JOB_COMPLETED'],
      work_remaining:true,
      waiting_external:false,
      job_id:'job-2',
      job_status:'COMPLETED',
    },
  },{maxAutonomy:true,now:2000});
  assert.equal(progress.status,'ADVANCING');
  assert.equal(progress.tripped,false);
  assert.equal(progress.consecutive_stalls,0);
  assert.equal(progress.counters.jobs_created,1);
  assert.equal(progress.counters.jobs_completed,1);
  assert.equal(progress.counters.advanced_ticks,1);
});

test('lease contention is visible but is not misclassified as a MAX stall', async()=>{
  const db=new MemoryD1();
  for(let i=0;i<5;i++){
    const row=await recordAutonomyProgressWatchdog(db,{
      status:'SKIPPED_LEASE_BUSY',
      advanced:false,
      reason:'AUTONOMY_RUNTIME_LEASE_BUSY',
      progress:{
        advanced:false,
        events:[],
        work_remaining:true,
        waiting_external:false,
        block_reason:'AUTONOMY_RUNTIME_LEASE_BUSY',
      },
    },{maxAutonomy:true,now:1000+i});
    assert.equal(row.tripped,false);
    assert.equal(row.status,'LEASE_BUSY');
  }
  const final=await readAutonomyProgressWatchdog(db);
  assert.equal(final.counters.lease_busy_skips,5);
  assert.equal(final.consecutive_stalls,0);
});

test('waiting external execution remains explicit and MAX disable resets the watchdog', async()=>{
  const db=new MemoryD1();
  const waiting=await recordAutonomyProgressWatchdog(db,{
    advanced:false,
    progress:{
      advanced:false,
      events:[],
      work_remaining:true,
      waiting_external:true,
      block_reason:'BRIDGE_EXECUTION_IN_PROGRESS',
    },
  },{maxAutonomy:true,now:1000});
  assert.equal(waiting.status,'WAITING_EXTERNAL');
  assert.equal(waiting.tripped,false);
  const disabled=await resetAutonomyProgressWatchdog(db,{status:'DISABLED',now:2000});
  assert.equal(disabled.status,'DISABLED');
  assert.equal(disabled.tripped,false);
  assert.equal(disabled.consecutive_stalls,0);
});
