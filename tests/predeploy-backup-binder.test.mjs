import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindingCanonical,
  diagnoseCandidates,
  preparePredeployRelease,
  selectVerifiedCandidate,
} from '../release-tools/predeploy-backup-binder/worker.js';

const now=Date.parse('2026-09-28T20:00:00.000Z');
const integrity='a'.repeat(64);
const sha='b'.repeat(40);

function row(overrides={}){
  const id=overrides.id||'system-20260928190000000';
  const meta={
    createdAt:'2026-09-28T19:00:00.000Z',
    integritySha256:integrity,
    verified:true,
    encrypted:true,
    restoreVerified:true,
    restoreIntegritySha256:integrity,
    restoreDeployedGitSha:sha,
    encryptionKeyId:'key-current',
    ...(overrides.meta||{}),
  };
  return {
    id,
    object_key:`backups/system/${id}.enc.json`,
    metadata_json:JSON.stringify(meta),
    created_at:Date.parse(meta.createdAt),
    ...overrides.row,
  };
}

test('predeploy binder selects only recent encrypted verified restore evidence',()=>{
  assert.equal(selectVerifiedCandidate([
    row({id:'plain',meta:{encrypted:false}}),
    row({id:'unverified',meta:{verified:false}}),
    row({id:'stale',meta:{createdAt:'2026-09-26T10:00:00.000Z'}}),
    row(),
  ],{nowMs:now})?.id,'system-20260928190000000');
});

test('predeploy binder rejects mismatched integrity and unexpected object key',()=>{
  assert.equal(selectVerifiedCandidate([
    row({meta:{restoreIntegritySha256:'c'.repeat(64)}}),
    row({row:{object_key:'backups/system/wrong.enc.json'}}),
  ],{nowMs:now}),null);
});

test('release backup binding canonical form stays byte-for-byte compatible',()=>{
  const value={
    deployed_sha:'1'.repeat(40),
    snapshot_id:'system-1',
    snapshot_integrity_sha256:'2'.repeat(64),
    snapshot_deployed_sha:'3'.repeat(40),
    snapshot_created_at:'2026-09-28T19:00:00.000Z',
    bound_at:123456789,
  };
  assert.equal(bindingCanonical(value),JSON.stringify({
    schema:'MEL_RELEASE_BACKUP_BINDING_V1',
    deployed_sha:value.deployed_sha,
    snapshot_id:value.snapshot_id,
    snapshot_integrity_sha256:value.snapshot_integrity_sha256,
    snapshot_deployed_sha:value.snapshot_deployed_sha,
    snapshot_created_at:value.snapshot_created_at,
    bound_at:value.bound_at,
  }));
});


test('predeploy binder diagnostics expose aggregate rejection reasons without backup contents',()=>{
  const summary=diagnoseCandidates([
    row({id:'stale',meta:{createdAt:'2026-09-26T10:00:00.000Z'}}),
    row({id:'plain',meta:{encrypted:false}}),
    row({id:'bad-restore',meta:{restoreVerified:false}}),
  ],{nowMs:now});
  assert.equal(summary.total_rows,3);
  assert.equal(summary.encrypted,2);
  assert.equal(summary.verified,3);
  assert.equal(summary.restore_verified,2);
  assert.equal(summary.recent,2);
  assert.equal(summary.fully_eligible,0);
  assert.equal(summary.max_age_ms,48*60*60*1000);
  assert.equal(summary.newest_created_at,'2026-09-28T19:00:00.000Z');
  assert.equal(summary.newest_age_ms,60*60*1000);
  assert.equal('metadata_json' in summary,false);
});


test('predeploy binder accepts a fully verified 36h backup inside the production 48h grace',()=>{
  const thirtySixHoursAgo=now-(36*60*60*1000);
  const candidate=row({
    id:'system-36h',
    meta:{createdAt:new Date(thirtySixHoursAgo).toISOString()},
    row:{created_at:thirtySixHoursAgo},
  });
  assert.equal(selectVerifiedCandidate([candidate],{nowMs:now})?.id,'system-36h');
});

test('predeploy binder still rejects a fully verified backup older than 48h',()=>{
  const fortyNineHoursAgo=now-(49*60*60*1000);
  const candidate=row({
    id:'system-49h',
    meta:{createdAt:new Date(fortyNineHoursAgo).toISOString()},
    row:{created_at:fortyNineHoursAgo},
  });
  assert.equal(selectVerifiedCandidate([candidate],{nowMs:now}),null);
});


test('predeploy prepare pauses autonomy and proves a real restore backup without main Worker secrets',async()=>{
  const rows=[row()];
  const state=new Map();
  const DB={
    prepare(sql){
      return {
        _args:[],
        bind(...args){this._args=args;return this;},
        async run(){
          if(sql.includes('INSERT INTO dev_bridge_state')){
            state.set('control',{status:'PAUSED',metadata_json:this._args[3]});
          }
          return {success:true};
        },
        async first(){
          if(sql.includes('FROM dev_bridge_state')){
            return state.get('control')||{status:'MAX_AUTONOMY',metadata_json:JSON.stringify({paused:false,max_autonomy:true,owner_override:true})};
          }
          return null;
        },
        async all(){
          if(sql.includes('FROM backup_objects')) return {results:rows};
          return {results:[]};
        },
      };
    },
  };
  const MEDIA_BUCKET={async head(key){return key===rows[0].object_key?{size:4096}:null;}};
  const result=await preparePredeployRelease({DB,MEDIA_BUCKET},{nowMs:now});
  assert.equal(result.ok,true);
  assert.equal(result.status,'PREDEPLOY_RELEASE_PREPARED');
  assert.equal(result.autonomy.paused,true);
  assert.equal(result.autonomy.max_autonomy,true);
  assert.equal(result.backup.restore_candidate_verified,true);
  assert.equal(result.backup.backup_object_present,true);
  assert.equal(result.backup.backup_object_bytes,4096);
  assert.equal(result.backup.snapshot_deployed_sha,sha);
});
