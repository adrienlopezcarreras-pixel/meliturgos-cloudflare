import test from 'node:test';
import assert from 'node:assert/strict';
import binder,{selectVerifiedBackupCandidate,releaseBindingPayload} from '../scripts/predeploy-release-binder-worker.js';

function verifiedRow({id='system-20260928',now=Date.now(),sha='a'.repeat(40)}={}){
  const integrity='b'.repeat(64);
  return {
    id,
    object_key:`backups/system/${id}.enc.json`,
    created_at:now,
    metadata_json:JSON.stringify({
      id,
      objectKey:`backups/system/${id}.enc.json`,
      createdAt:new Date(now).toISOString(),
      encrypted:true,
      verified:true,
      restoreVerified:true,
      integritySha256:integrity,
      restoreIntegritySha256:integrity,
      restoreDeployedGitSha:sha,
    }),
  };
}

test('predeploy binder selects only recent encrypted verified restore evidence',()=>{
  const now=Date.now();
  const stale=verifiedRow({id:'system-stale',now:now-30*60*60*1000});
  const good=verifiedRow({id:'system-good',now});
  const selected=selectVerifiedBackupCandidate([stale,good],{nowMs:now});
  assert.equal(selected.id,'system-good');
  assert.equal(selected.objectKey,'backups/system/system-good.enc.json');
});

test('predeploy binder writes canonical SHA to backup binding with auth',async()=>{
  const now=Date.now();
  const row=verifiedRow({now});
  const writes=[];
  const DB={
    prepare(sql){
      return {
        bind(...params){writes.push({sql:String(sql),params});return this;},
        async all(){return {results:[row]};},
        async run(){return {success:true};},
      };
    },
  };
  const token='t'.repeat(64);
  const target='c'.repeat(40);
  const response=await binder.fetch(new Request('https://binder.test/',{
    method:'POST',
    headers:{'x-mel-predeploy-binder':token},
  }),{PREDEPLOY_BIND_TOKEN:token,TARGET_DEPLOYED_SHA:target,DB});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.status,'RELEASE_BACKUP_BOUND');
  assert.equal(body.deployed_sha,target);
  assert.equal(body.snapshot_id,row.id);
  const insert=writes.find(item=>item.sql.includes('release_backup_bindings'));
  assert.ok(insert);
  assert.equal(insert.params[0],target);
  assert.match(String(insert.params[6]),/^[0-9a-f]{64}$/);
});

test('predeploy binder rejects an invalid token before D1 access',async()=>{
  let touched=false;
  const DB={prepare(){touched=true;throw new Error('must not touch D1');}};
  const response=await binder.fetch(new Request('https://binder.test/',{
    method:'POST',
    headers:{'x-mel-predeploy-binder':'wrong'},
  }),{PREDEPLOY_BIND_TOKEN:'x'.repeat(64),TARGET_DEPLOYED_SHA:'d'.repeat(40),DB});
  assert.equal(response.status,401);
  assert.equal(touched,false);
});

test('release binding payload keeps canonical field order and values',()=>{
  const candidate={id:'id',integrity:'e'.repeat(64),restoreSha:'f'.repeat(40),createdAt:'2026-09-28T00:00:00.000Z'};
  const payload=releaseBindingPayload(candidate,'a'.repeat(40),123);
  assert.deepEqual(Object.keys(payload),[
    'schema','deployed_sha','snapshot_id','snapshot_integrity_sha256','snapshot_deployed_sha','snapshot_created_at','bound_at'
  ]);
});
