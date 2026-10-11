import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { migrate } from '../../src/persistence/migrations.js';
import {
  reconcileDiscoveryJobs,
  proveEcosystemTeacherHandoff,
} from '../../src/evaluation/capability-watch-runtime.js';

test('GEN2-42 release reconciliation never resumes queued external work when resumeQueued is false', async () => {
  let resumeCalls = 0;
  let mirrorCalls = 0;
  const repository = {
    async get(id) {
      return {
        id,
        status:'QUEUED',
        requested_by:'mel-autonomy',
        optional_context:{ source:'ecosystem-watch' },
        created_at:1,
        result_json:{},
      };
    },
  };
  const ledger = {
    items:[{
      fingerprint:'queued-proof',
      handoff:{
        job_id:'job-queued',
        status:'QUEUED',
        teacher_request_id:null,
        closed:false,
      },
    }],
  };

  const result = await reconcileDiscoveryJobs({}, ledger, {
    repository,
    resumeQueued:false,
    resumeTeacherRequest:async()=>{ resumeCalls += 1; throw new Error('MUST_NOT_RUN'); },
    mirrorTeacherRequest:async()=>{ mirrorCalls += 1; throw new Error('MUST_NOT_RUN'); },
  });

  assert.equal(resumeCalls,0);
  assert.equal(mirrorCalls,0);
  assert.equal(result.resumed,null);
});

test('GEN2-42 production proof advances only COUNCIL_COMPLETE into a durable Teacher handoff', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[{
        fingerprint:'council-ready',
        handoff:{
          job_id:'job-council',
          status:'COUNCIL_COMPLETE',
          teacher_request_id:null,
          candidate_sha:'b'.repeat(40),
          closed:false,
        },
      }],
    };
    await DB.prepare(
      `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`
    ).bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();

    let job={
      id:'job-council',
      status:'COUNCIL_COMPLETE',
      requested_by:'mel-autonomy',
      optional_context:{source:'ecosystem-watch'},
      created_at:1,
      result_json:{},
    };
    let resumeCalls=0;
    let mirrorCalls=0;
    const repository={
      async get(id){ return id===job.id ? structuredClone(job) : null; },
    };

    const proof=await proveEcosystemTeacherHandoff({DB},{
      developmentRepository:repository,
      resumeTeacherRequest:async()=>{
        resumeCalls+=1;
        job={
          ...job,
          status:'WAITING_TEACHER',
          result_json:{
            teacher_bridge:{
              status:'WAITING_TEACHER',
              request:{
                request_id:'req-council',
                target_sha:'b'.repeat(40),
                provenance:{candidate_sha:'b'.repeat(40)},
              },
            },
          },
        };
        return job.result_json.teacher_bridge;
      },
      mirrorTeacherRequest:async()=>{
        mirrorCalls+=1;
        return {status:'MIRRORED',request_id:'req-council'};
      },
    });

    assert.equal(resumeCalls,1);
    assert.equal(mirrorCalls,1);
    assert.equal(proof.ok,true);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_READY');
    assert.equal(proof.active_teacher_handoff_count,1);
    assert.equal(proof.blocked_open_handoff_count,0);
    assert.equal(proof.job_id,'job-council');
    assert.equal(proof.teacher_request_id,'req-council');
    assert.equal(proof.resumed.status,'WAITING_TEACHER');
    assert.equal(proof.production_activation_allowed,false);
    assert.equal(proof.auto_approval_allowed,false);
  } finally {
    DB.close();
  }
});


test('GEN2-42 production proof reads a real WAITING_TEACHER handoff without external resume or mirror', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger = {
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[{
        fingerprint:'live-proof',
        handoff:{
          job_id:'job-live',
          status:'WAITING_TEACHER',
          teacher_request_id:'req-live',
          candidate_sha:'a'.repeat(40),
          closed:false,
        },
      }],
    };
    await DB.prepare(
      `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`
    ).bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();

    let resumeCalls=0;
    let mirrorCalls=0;
    const repository={
      async get(id){
        return {
          id,
          status:'WAITING_TEACHER',
          requested_by:'mel-autonomy',
          optional_context:{source:'ecosystem-watch'},
          created_at:1,
          result_json:{
            teacher_bridge:{
              status:'WAITING_TEACHER',
              request:{request_id:'req-live',target_sha:'a'.repeat(40)},
            },
          },
        };
      },
    };

    const proof=await proveEcosystemTeacherHandoff({DB},{
      developmentRepository:repository,
      resumeTeacherRequest:async()=>{resumeCalls+=1;throw new Error('MUST_NOT_RUN');},
      mirrorTeacherRequest:async()=>{mirrorCalls+=1;throw new Error('MUST_NOT_RUN');},
    });

    assert.equal(resumeCalls,0);
    assert.equal(mirrorCalls,0);
    assert.equal(proof.ok,true);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_READY');
    assert.equal(proof.active_teacher_handoff_count,1);
    assert.equal(proof.job_id,'job-live');
    assert.equal(proof.teacher_request_id,'req-live');
    assert.equal(proof.production_activation_allowed,false);
    assert.equal(proof.auto_approval_allowed,false);
  } finally {
    DB.close();
  }
});


test('GEN2-42 production proof accepts a truly idle ledger without masking open blocked handoffs', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    await DB.prepare(
      `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`
    ).bind('ecosystem-discoveries-canonical',JSON.stringify({schema:'mel.ecosystem-discovery-ledger.v1',items:[]}),Date.now()).run();

    const idle=await proveEcosystemTeacherHandoff({DB},{
      developmentRepository:{ async get(){ return null; } },
    });
    assert.equal(idle.ok,true);
    assert.equal(idle.status,'GEN2_42_TEACHER_HANDOFF_IDLE_VERIFIED');
    assert.equal(idle.idle_verified,true);
    assert.equal(idle.open_handoff_count,0);
    assert.equal(idle.active_teacher_handoff_count,0);
    assert.equal(idle.job_id,null);
    assert.equal(idle.teacher_request_id,null);

    const blockedLedger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[{
        fingerprint:'blocked-proof',
        handoff:{job_id:'job-blocked',status:'QUEUED',teacher_request_id:null,closed:false},
      }],
    };
    await DB.prepare(
      `UPDATE capability_watch_state SET state_json=?,updated_at=? WHERE id=?`
    ).bind(JSON.stringify(blockedLedger),Date.now(),'ecosystem-discoveries-canonical').run();

    const blocked=await proveEcosystemTeacherHandoff({DB},{
      developmentRepository:{
        async get(id){
          return {id,status:'QUEUED',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},created_at:1,result_json:{}};
        },
      },
    });
    assert.equal(blocked.ok,false);
    assert.equal(blocked.status,'GEN2_42_TEACHER_HANDOFF_NOT_READY');
    assert.equal(blocked.idle_verified,false);
    assert.equal(blocked.open_handoff_count,1);
  } finally {
    DB.close();
  }
});


test('GEN2-42 production proof accepts only fully Teacher-proven open progress', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[
        {fingerprint:'approved',handoff:{job_id:'job-approved',status:'TEACHER_APPROVED',teacher_request_id:'req-approved',closed:false}},
        {fingerprint:'review',handoff:{job_id:'job-review',status:'READY_FOR_REVIEW',teacher_request_id:'req-review',closed:false}},
      ],
    };
    await DB.prepare(`INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`)
      .bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();
    const jobs={
      'job-approved':{id:'job-approved',status:'TEACHER_APPROVED',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},result_json:{teacher_bridge:{request:{request_id:'req-approved'}}}},
      'job-review':{id:'job-review',status:'READY_FOR_REVIEW',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},result_json:{teacher_bridge:{request:{request_id:'req-review'}}}},
    };
    const proof=await proveEcosystemTeacherHandoff({DB},{developmentRepository:{async get(id){return jobs[id]||null;}}});
    assert.equal(proof.ok,true);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_PROGRESS_VERIFIED');
    assert.equal(proof.progress_verified,true);
    assert.equal(proof.teacher_proven_handoff_count,2);
    assert.equal(proof.blocked_open_handoff_count,0);
  } finally { DB.close(); }
});


test('GEN2-42 release proof accepts mixed Teacher-proven progress while keeping blocked backlog observable', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[
        {fingerprint:'teacher-proven',handoff:{job_id:'job-approved',status:'TEACHER_APPROVED',teacher_request_id:'req-approved',closed:false}},
        {fingerprint:'queued-backlog',handoff:{job_id:'job-queued',status:'QUEUED',teacher_request_id:null,closed:false}},
      ],
    };
    await DB.prepare(`INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`)
      .bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();
    const jobs={
      'job-approved':{id:'job-approved',status:'TEACHER_APPROVED',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},result_json:{teacher_bridge:{request:{request_id:'req-approved'}}}},
      'job-queued':{id:'job-queued',status:'QUEUED',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},plan_json:{},result_json:{}},
    };
    const proof=await proveEcosystemTeacherHandoff({DB},{developmentRepository:{async get(id){return jobs[id]||null;}}});
    assert.equal(proof.ok,true);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_PROGRESS_VERIFIED');
    assert.equal(proof.progress_verified,true);
    assert.equal(proof.teacher_proven_handoff_count,1);
    assert.equal(proof.blocked_open_handoff_count,1);
    assert.equal(proof.open_handoff_count,2);
    assert.equal(proof.production_activation_allowed,false);
    assert.equal(proof.auto_approval_allowed,false);
  } finally { DB.close(); }
});

test('GEN2-42 release proof keeps retryable failures observable but non-blocking', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[
        {fingerprint:'retryable',handoff:{job_id:'job-retry',status:'FAILED',teacher_request_id:'req-retry',closed:false,retryable:true,code:'AUTONOMY_RUNTIME_RETRY_EXHAUSTED:CODE_HEAD_PIN_MISMATCH'}},
        {fingerprint:'approved',handoff:{job_id:'job-approved',status:'TEACHER_APPROVED',teacher_request_id:'req-approved',closed:false}},
      ],
    };
    await DB.prepare(`INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`)
      .bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();
    const jobs={
      'job-retry':{id:'job-retry',status:'FAILED',error:'AUTONOMY_RUNTIME_RETRY_EXHAUSTED:CODE_HEAD_PIN_MISMATCH',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},result_json:{teacher_bridge:{request:{request_id:'req-retry'}}}},
      'job-approved':{id:'job-approved',status:'TEACHER_APPROVED',requested_by:'mel-autonomy',optional_context:{source:'ecosystem-watch'},result_json:{teacher_bridge:{request:{request_id:'req-approved'}}}},
    };
    const proof=await proveEcosystemTeacherHandoff({DB},{developmentRepository:{async get(id){return jobs[id]||null;}}});
    assert.equal(proof.ok,true);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_PROGRESS_VERIFIED');
    assert.equal(proof.open_handoff_count,1);
    assert.equal(proof.teacher_proven_handoff_count,1);
    assert.equal(proof.blocked_open_handoff_count,0);
    assert.equal(proof.released_retryable_failure_count,1);
    assert.equal(proof.released_retryable_failures[0].code,'AUTONOMY_RUNTIME_RETRY_EXHAUSTED:CODE_HEAD_PIN_MISMATCH');
  } finally { DB.close(); }
});


test('GEN2-42 production proof resumes a QUEUED handoff only when Council evidence is already persisted', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[{
        fingerprint:'prepared-queued',
        handoff:{
          job_id:'job-prepared',
          status:'QUEUED',
          teacher_request_id:'req-old',
          candidate_sha:'b'.repeat(40),
          closed:false,
        },
      }],
    };
    await DB.prepare(
      `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`
    ).bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();

    let job={
      id:'job-prepared',
      status:'QUEUED',
      requested_by:'mel-autonomy',
      optional_context:{source:'ecosystem-watch'},
      created_at:1,
      plan_json:{
        preflight:{
          council:{
            status:'COMPLETE',
            responses:[{provider:'fixture-a'},{provider:'fixture-b'}],
          },
        },
      },
      result_json:{},
    };
    let resumeCalls=0;
    let mirrorCalls=0;
    const repository={
      async get(id){ return id===job.id ? structuredClone(job) : null; },
    };

    const proof=await proveEcosystemTeacherHandoff({DB},{
      developmentRepository:repository,
      resumeTeacherRequest:async()=>{
        resumeCalls+=1;
        job={
          ...job,
          status:'WAITING_TEACHER',
          result_json:{
            teacher_bridge:{
              status:'WAITING_TEACHER',
              request:{
                request_id:'req-prepared',
                target_sha:'b'.repeat(40),
                provenance:{candidate_sha:'b'.repeat(40)},
              },
            },
          },
        };
        return job.result_json.teacher_bridge;
      },
      mirrorTeacherRequest:async()=>{
        mirrorCalls+=1;
        return {status:'MIRRORED',request_id:'req-prepared'};
      },
    });

    assert.equal(resumeCalls,1);
    assert.equal(mirrorCalls,1);
    assert.equal(proof.ok,true);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_READY');
    assert.equal(proof.resumed.status,'WAITING_TEACHER');
    assert.equal(proof.teacher_request_id,'req-prepared');
    assert.equal(proof.blocked_open_handoff_count,0);
    assert.equal(proof.production_activation_allowed,false);
    assert.equal(proof.auto_approval_allowed,false);
  } finally {
    DB.close();
  }
});

test('GEN2-42 production proof still refuses an unprepared QUEUED handoff', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[{
        fingerprint:'unprepared-queued',
        handoff:{job_id:'job-unprepared',status:'QUEUED',teacher_request_id:'req-stale',closed:false},
      }],
    };
    await DB.prepare(
      `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`
    ).bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();

    let resumeCalls=0;
    const proof=await proveEcosystemTeacherHandoff({DB},{
      developmentRepository:{
        async get(id){
          return {
            id,
            status:'QUEUED',
            requested_by:'mel-autonomy',
            optional_context:{source:'ecosystem-watch'},
            created_at:1,
            plan_json:{},
            result_json:{},
          };
        },
      },
      resumeTeacherRequest:async()=>{resumeCalls+=1;throw new Error('MUST_NOT_RUN');},
    });

    assert.equal(resumeCalls,0);
    assert.equal(proof.ok,false);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_NOT_READY');
    assert.equal(proof.blocked_open_handoff_count,1);
  } finally {
    DB.close();
  }
});


test('GEN2-42 release proof keeps a durably stale Teacher requeue observable but non-blocking', async () => {
  const DB=sqliteD1();
  try {
    await migrate(DB);
    const ledger={
      schema:'mel.ecosystem-discovery-ledger.v1',
      items:[{
        fingerprint:'capability:video.generate',
        handoff:{
          job_id:'job-stale-requeue',
          status:'QUEUED',
          teacher_request_id:'req-stale',
          candidate_sha:'a'.repeat(40),
          closed:false,
          attempts:2,
        },
      }],
    };
    await DB.prepare(
      `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)`
    ).bind('ecosystem-discoveries-canonical',JSON.stringify(ledger),Date.now()).run();

    let resumeCalls=0;
    const proof=await proveEcosystemTeacherHandoff({DB},{
      developmentRepository:{
        async get(id){
          if(id!=='job-stale-requeue') return null;
          return {
            id,
            status:'QUEUED',
            requested_by:'mel-autonomy',
            optional_context:{source:'ecosystem-watch',request_key:'capability:video.generate',roadmap_id:'GEN2-42'},
            created_at:1,
            updated_at:2,
            plan_json:{
              revision:{
                reason:'TEACHER_REQUEST_STALE_SHA',
                previous_request_id:'req-stale',
              },
            },
            result_json:{
              teacher_bridge_history:[{
                status:'STALE',
                request:{request_id:'req-stale'},
              }],
            },
          };
        },
      },
      resumeTeacherRequest:async()=>{resumeCalls+=1;throw new Error('MUST_NOT_RUN');},
    });

    assert.equal(resumeCalls,0);
    assert.equal(proof.ok,true);
    assert.equal(proof.status,'GEN2_42_TEACHER_HANDOFF_IDLE_VERIFIED');
    assert.equal(proof.idle_verified,true);
    assert.equal(proof.open_handoff_count,0);
    assert.equal(proof.blocked_open_handoff_count,0);
    assert.equal(proof.released_stale_teacher_requeue_count,1);
    assert.equal(proof.released_stale_teacher_requeues[0].job_id,'job-stale-requeue');
    assert.equal(proof.released_stale_teacher_requeues[0].teacher_request_id,null);
    assert.equal(proof.released_stale_teacher_requeues[0].candidate_sha,null);
    assert.equal(proof.released_stale_teacher_requeues[0].retryable,true);
    assert.equal(proof.released_stale_teacher_requeues[0].code,'TEACHER_REQUEST_STALE_SHA');
    assert.equal(proof.production_activation_allowed,false);
    assert.equal(proof.auto_approval_allowed,false);
  } finally {
    DB.close();
  }
});
