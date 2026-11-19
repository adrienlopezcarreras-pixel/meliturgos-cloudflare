import test from 'node:test';
import assert from 'node:assert/strict';
import {describeWorkshopSkills,workshopSkillSummary,WORKSHOP_SKILLS_SCHEMA,
  WORKSHOP_ACTIONS_SCHEMA} from '../src/workshop/workshop-skills.js';

const families = {
  via: ['project.create','project.open','project.save'],
  studio: ['bat.validate','magazine.create','magazine.edit','magazine.export','page.preview'],
  video: ['media.import','quality.review','render.start','scene.edit','scene.preview'],
  audio: ['assembly.export','take.approve','timeline.edit','voice.record','voice.replay'],
  companion: ['control.request','message.send','session.inspect'],
  social: ['group.join','group.rules','group.search','group.select','post.publish'],
};
function snapshot() {
  return {
    schema: WORKSHOP_SKILLS_SCHEMA, source_schema: WORKSHOP_ACTIONS_SCHEMA,
    execution_authorized: false,
    skills: Object.entries(families).flatMap(([surface,actions]) =>
      actions.map(action => ({
        id: surface + '.' + action, surface, connected: false,
        verified_in_window: false, available: false, status: 'unavailable',
        requires_approval: false,
      }))),
  };
}

test('not authenticated means no available skill even with alleged success', () => {
  const input = snapshot();
  input.skills[0].available = true;
  input.skills[0].verified_in_window = true;
  input.skills[0].connected = true;
  input.skills[0].status = 'verified';
  const result = describeWorkshopSkills(input);
  assert.equal(result.source_verified,false);
  assert.equal(result.execution_authorized,false);
  assert.ok(result.skills.every(x=>x.available===false));
});

test('authenticated VIA catalog is read-only and preserves verified observations', () => {
  const input = snapshot();
  input.skills[0].available = true;
  input.skills[0].verified_in_window = true;
  input.skills[0].connected = true;
  input.skills[0].status = 'verified';
  const output = describeWorkshopSkills(input, {authenticated:true});
  assert.equal(output.source_verified,true);
  assert.equal(output.execution_authorized,false);
  assert.equal(output.skills.filter(x=>x.available).length,1);
  assert.equal(output.skills[0].id,'via.project.create');
  assert.deepEqual(workshopSkillSummary(output).sections.map(x=>x.section),
    ['VIA','ÉDITEUR','MÉDIA · vidéo','MÉDIA · audio','MEL Companion','PROMOTION']);
});

test('invalid source, duplicate, missing fields or executable authorization fail closed', () => {
  const broken = [
    null, {}, {...snapshot(),execution_authorized:true},
    {...snapshot(),source_schema:'wrong'},
    {...snapshot(),skills:[...snapshot().skills.slice(0,-1)]},
    {...snapshot(),skills:[...snapshot().skills.slice(0,-1),snapshot().skills[0]]},
    {...snapshot(),skills: snapshot().skills.map((row,i) => i===0 ? {...row,id:'via.shell'}:row)},
    {...snapshot(),skills: snapshot().skills.map((row,i) => i===0 ? {...row,available:'yes'}:row)},
  ];
  for(const value of broken){
    const out=describeWorkshopSkills(value,{authenticated:true});
    assert.equal(out.execution_authorized,false);
    assert.ok(out.skills.every(x=>x.available===false));
  }
});

test('registered alone, or unverifiable status, never advertises working action', () => {
  const input=snapshot();
  input.skills[0].connected=true;
  input.skills[0].available=true;
  const out=describeWorkshopSkills(input,{authenticated:true});
  assert.equal(out.skills[0].available,false);
  assert.equal(out.skills[0].status,'unavailable');
});
