import test from 'node:test';
import assert from 'node:assert/strict';
import { MentorEngine, mentorPolicy } from '../src/learning/mentor-engine.js';

test('canonical Mentor refuses sensitive/outside-repository inspection paths', async () => {
  const engine=new MentorEngine({providerFactory:async()=>[]});
  await assert.rejects(
    ()=>engine.propose({env:{},goal:'Modifier auth',inspectedFiles:[{path:'../.env',content:'secret'}]}),
    error=>error.code==='MENTOR_PATH_DENIED'
  );
});

test('Mentor keeps deployment authorization explicit', () => {
  assert.equal(mentorPolicy.deployment_requires_human_approval,true);
  assert.ok(Array.isArray(mentorPolicy.allowed_tests));
  assert.ok(mentorPolicy.allowed_tests.includes('test:smoke'));
});
