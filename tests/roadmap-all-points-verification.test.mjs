import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { withRuntimeRecertification } from '../src/roadmap/runtime-recertification.js';
import { proofRecipeMissionId } from '../src/roadmap/proof-recipe-contracts.js';
import { roadmapCodeContract, assertRoadmapCodeChanges } from '../src/roadmap/roadmap-code-contracts.js';
import { buildPassiveRoadmapCatalog } from '../src/evolution/autonomy-activity.js';
import { AutonomySupervisor } from '../src/evolution/autonomy-supervisor.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const unproven = items => ({available:true,items:Object.fromEntries(items.map(row=>[row.id,{truth:'UNPROVEN'}]))});
test('every canonical point without a live proof has executable work or a bounded recipe-code mission', () => {
  const canonical=flattenRoadmap(), expanded=withRuntimeRecertification(canonical,unproven(canonical));
  assert.equal(canonical.length,173);
  for(const item of expanded.filter(row=>!row.proof_recipe_only)) {
    if(item.mode==='VERIFY_RUNTIME') continue;
    if(item.contract_revision) { assert.ok(item.code_paths.length && item.test_paths.length); continue; }
    assert.equal(item.status,'WAITING_PROOF_RECIPE',item.id);
    const recipe=expanded.find(row=>row.id===item.proof_recipe_mission_id);
    assert.ok(recipe?.proof_recipe_only,item.id);
    assert.equal(recipe.verification_target_id,item.id);
    assert.ok(recipe.code_paths.length && recipe.test_paths.length && recipe.acceptance.length);
    assert.equal(recipe.verify_existing,false);
    assert.ok(roadmapCodeContract(recipe.id));
  }
  assert.equal(new Set(expanded.map(row=>row.id)).size,expanded.length);
  assert.equal(flattenRoadmap().length,173,'auxiliary code work never inflates the product registry');
});

test('the passive catalog counts current evidence rather than historic DONE declarations', () => {
  const rows=flattenRoadmap().filter(row=>['GEN2-02','GEN2-06'].includes(row.id));
  const truth=unproven(rows);truth.items['GEN2-02'].truth='VERIFIED_LIVE';
  const catalog=buildPassiveRoadmapCatalog(rows,[],{truth});
  assert.equal(catalog.total,2);assert.equal(catalog.verified,1);assert.equal(catalog.remaining,1);
  assert.equal(catalog.items[0].id,'GEN2-06');
  assert.equal(catalog.items[0].state,'PROOF_RECIPE_REQUIRED');
  assert.equal(catalog.items[0].proof_recipe_mission.certifies_parent,false);
  const unavailable=buildPassiveRoadmapCatalog(rows,[],{truth:{available:false}});
  assert.equal(unavailable.verified,0);assert.equal(unavailable.items[0].state,'PROOF_STATUS_UNAVAILABLE');
});

test('the real scheduler admits one recipe mission, keeps its target unverified and preserves scope', async t => {
  const db=sqliteD1({maintenanceFence:true});t.after(()=>db.close());
  const repository=new D1DevJobRepository(db), original=flattenRoadmap().find(row=>row.id==='GEN2-06');
  const roadmap=withRuntimeRecertification([original],unproven([original]));
  const supervisor=new AutonomySupervisor({repository,roadmap});
  const first=await supervisor.ensureNextJob();
  assert.equal(first.created,true);
  assert.equal(first.job.optional_context.roadmap_id,proofRecipeMissionId(original.id));
  assert.equal(first.job.optional_context.verification_target_id,original.id);
  assert.match(first.job.goal,/VERIFY_EXISTING_INTERDIT/);
  assert.match(first.job.goal,/Conversation Service/);
  const again=await supervisor.ensureNextJob();
  assert.equal(again.created,false);assert.equal(again.job.id,first.job.id);
  assert.equal((await supervisor.state()).completedIds.includes(original.id),false);
  assert.throws(()=>assertRoadmapCodeChanges(first.job,[{path:'src/roadmap/master-roadmap.js',content:'fake green'}]),{code:'ROADMAP_CODE_SCOPE_VIOLATION'});
  assert.equal(roadmapCodeContract('ROADMAP-PROOF-not-a-roadmap-point'),null);
});

test('a recipe for a dependent objective waits for its real prerequisite', async t => {
  const db=sqliteD1({maintenanceFence:true});t.after(()=>db.close());
  const child={...flattenRoadmap().find(row=>row.id==='GEN2-06'),depends_on:['GEN2-09']};
  const parent=flattenRoadmap().find(row=>row.id==='GEN2-09');
  const roadmap=withRuntimeRecertification([child,parent],unproven([child,parent]));
  const supervisor=new AutonomySupervisor({repository:new D1DevJobRepository(db),roadmap});
  assert.equal((await supervisor.ensureNextJob()).job.optional_context.roadmap_id,proofRecipeMissionId(parent.id));
});
