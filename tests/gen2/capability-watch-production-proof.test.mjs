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
