import test from 'node:test';
import assert from 'node:assert/strict';
import { SovereigntyCandidateStore } from '../../src/portability/sovereignty-candidate-store.js';

function fakeDb(){
  const rows=new Map();
  return {
    prepare(sql){
      return {
        bind(...args){
          return {
            async run(){
              if(/^CREATE TABLE/i.test(sql))return{success:true};
              if(/INSERT INTO mel_sovereignty_candidates/i.test(sql)){
                const [candidate_key,layer,candidate_id,provider_hint,source_url,source_title,status,first_seen_at,last_seen_at,seen_count,metadata_json]=args;
                const before=rows.get(candidate_key);
                rows.set(candidate_key,{
                  candidate_key,layer,candidate_id,provider_hint,source_url,source_title,
                  status,
                  first_seen_at:before?.first_seen_at||first_seen_at,
                  last_seen_at,
                  seen_count:(before?.seen_count||0)+1,
                  metadata_json,
                });
                return{success:true,meta:{changes:1}};
              }
              if(/UPDATE mel_sovereignty_candidates/i.test(sql)){
                const [status,metadata_json,last_seen_at,candidate_key]=args;
                const row=rows.get(candidate_key);
                if(!row)return{success:true,meta:{changes:0}};
                rows.set(candidate_key,{...row,status,metadata_json,last_seen_at});
                return{success:true,meta:{changes:1}};
              }
              return{success:true};
            },
            async first(){
              if(/SELECT first_seen_at,seen_count,status/i.test(sql)){
                const row=rows.get(args[0]);
                return row?{first_seen_at:row.first_seen_at,seen_count:row.seen_count,status:row.status}:null;
              }
              return null;
            },
            async all(){
              let out=[...rows.values()];
              if(/WHERE layer=\?/i.test(sql))out=out.filter(r=>r.layer===args[0]);
              if(/status=\?/i.test(sql)){
                const status=args[/WHERE layer=\?/i.test(sql)?1:0];
                out=out.filter(r=>r.status===status);
              }
              return{results:out};
            },
          };
        },
        async run(){return{success:true};},
      };
    },
  };
}

test('watch discoveries persist and deduplicate by layer+candidate id',async()=>{
  const store=new SovereigntyCandidateStore(fakeDb());
  const report={results:[{
    layer:'runtime',
    candidate_hints:[
      {id:'alt.example',provider_hint:'alt.example',source_url:'https://alt.example/docs',source_title:'Alt',status:'UNVERIFIED'},
    ],
  }]};
  await store.upsertFromWatch(report,{now:1000});
  await store.upsertFromWatch(report,{now:2000});
  const rows=await store.list({layer:'runtime'});
  assert.equal(rows.length,1);
  assert.equal(rows[0].seen_count,2);
  assert.equal(rows[0].status,'UNVERIFIED');
  assert.equal(rows[0].metadata.activation_allowed,false);
});

test('BLOCKED candidate is reset to UNVERIFIED when rediscovered so transient failures can recover',async()=>{
  const store=new SovereigntyCandidateStore(fakeDb());
  const report={results:[{layer:'source_control',candidate_hints:[{id:'companion-local-git',status:'UNVERIFIED'}]}]};
  await store.upsertFromWatch(report,{now:1000});
  await store.setStatus({layer:'source_control',id:'companion-local-git',status:'BLOCKED',metadata:{reason:'COMPANION_OFFLINE'}});
  await store.upsertFromWatch(report,{now:2000});
  const rows=await store.list({layer:'source_control'});
  assert.equal(rows[0].status,'UNVERIFIED');
});

test('REJECTED candidate remains rejected when rediscovered',async()=>{
  const store=new SovereigntyCandidateStore(fakeDb());
  const report={results:[{layer:'runtime',candidate_hints:[{id:'bad.example',status:'UNVERIFIED'}]}]};
  await store.upsertFromWatch(report,{now:1000});
  await store.setStatus({layer:'runtime',id:'bad.example',status:'REJECTED',metadata:{reason:'OWNER_REJECTED'}});
  await store.upsertFromWatch(report,{now:2000});
  const rows=await store.list({layer:'runtime'});
  assert.equal(rows[0].status,'REJECTED');
});

test('PREVALIDATED candidate status is not downgraded by later watch observations',async()=>{
  const store=new SovereigntyCandidateStore(fakeDb());
  const report={results:[{layer:'ai',candidate_hints:[{id:'ai.example',status:'UNVERIFIED'}]}]};
  await store.upsertFromWatch(report,{now:1000});
  await store.setStatus({layer:'ai',id:'ai.example',status:'PREVALIDATED',metadata:{proof:'ok'}});
  await store.upsertFromWatch(report,{now:2000});
  const rows=await store.list({layer:'ai'});
  assert.equal(rows[0].status,'PREVALIDATED');
});

test('invalid candidate lifecycle status is rejected',async()=>{
  const store=new SovereigntyCandidateStore(fakeDb());
  await assert.rejects(
    ()=>store.setStatus({layer:'runtime',id:'x',status:'ACTIVE_NOW'}),
    error=>error?.code==='SOVEREIGNTY_CANDIDATE_STATUS_INVALID',
  );
});
