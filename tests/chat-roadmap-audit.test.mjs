import test from 'node:test';
import assert from 'node:assert/strict';
import {getRoadmapPayload,flattenRoadmap,validateRoadmap,ROADMAP_REGISTRY_REVISION} from '../src/roadmap/master-roadmap.js';
import {classifyRoadmapItem} from '../src/roadmap/roadmap-truth.js';

test('the actual roadmap audit payload exposes all eight professional-chat acceptance goals as open',()=>{
 const payload=getRoadmapPayload(),phase=payload.phases.find(row=>row.id==='P19');
 assert.ok(phase);assert.equal(payload.source.revision,ROADMAP_REGISTRY_REVISION);
 assert.deepEqual(phase.items.map(row=>row.id),['MEL-CHAT-01','MEL-CHAT-02','MEL-CHAT-03','MEL-CHAT-04','MEL-CHAT-05','MEL-CHAT-06','MEL-CHAT-07','MEL-CHAT-08']);
 assert.ok(phase.items.every(row=>['IN_PROGRESS','PLANNED'].includes(row.status)));
 assert.ok(phase.items.every(row=>/Council réel/.test(row.next)),'no synthetic or missing Council verdict closes the acceptance goals');
 assert.equal(validateRoadmap().ok,true);
});

test('a successful primitive capability cannot falsely verify a complete chat acceptance goal',()=>{
 const evidence={capabilities:new Map(['code.read','code.search','web.images.search','media.video.analyze'].map(id=>[id,{ok:1,ko:0,last_ok:Date.now()}])),computer:new Map()};
 for(const item of flattenRoadmap().filter(row=>row.phase_id==='P19')){
  const truth=classifyRoadmapItem(item.id,evidence);assert.notEqual(truth.truth,'VERIFIED_LIVE');assert.equal(truth.proofs.length,0);
 }
});

test('historical engine proofs and the stricter Founder connector requirements are preserved',()=>{
 const rows=flattenRoadmap(),byId=id=>rows.find(row=>row.id===id);
 assert.equal(byId('MEL-MEDIA-02').status,'DONE_VERIFIED');assert.match(byId('MEL-MEDIA-02').next,/71d028320aabd9240478993629ed36f32344df7e/);
 assert.equal(byId('MEL-FOUNDER-01').status,'IN_PROGRESS');assert.match(byId('MEL-FOUNDER-01').next,/Gmail/);assert.match(byId('MEL-FOUNDER-01').next,/Agenda/);assert.match(byId('MEL-FOUNDER-01').next,/Drive/);
 for(const id of ['MEL-CODE-01','MEL-CODE-02','MEL-CODE-03']){assert.equal(byId(id).status,'DONE_VERIFIED');assert.match(byId(id).next,/MEL-CHAT-/);}
 assert.match(byId('MEL-CHAT-02').next,/fixtures/);assert.match(byId('MEL-CHAT-03').next,/vidéo jointe/);assert.match(byId('MEL-CHAT-06').next,/production/);
});
