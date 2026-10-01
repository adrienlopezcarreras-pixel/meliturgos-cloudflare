import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../src/capabilities/capability-bus.js';
import { registerPresentationCapabilities, inferPresentationProfile, buildPresentationInstruction } from '../src/presentation/presentation-skill.js';

test('presentation skill selects useful output profiles deterministically',()=>{
  assert.equal(inferPresentationProfile('rédige un rapport complet').id,'report');
  assert.equal(inferPresentationProfile('écris un email à mon fournisseur').id,'email');
  assert.equal(inferPresentationProfile('compare ces deux options').id,'comparison');
  assert.equal(inferPresentationProfile('réponds simplement').id,'chat');
});

test('presentation instruction enforces readable layout without overriding factual truth',()=>{
  const instruction=buildPresentationInstruction('prépare un document PDF');
  assert.match(instruction,/hiérarchie visuelle propre/i);
  assert.match(instruction,/Évite les murs de texte/i);
  assert.match(instruction,/tableaux uniquement/i);
  assert.match(instruction,/Ne sacrifie jamais la précision factuelle/i);
  assert.match(instruction,/"id":"document"/);
});

test('presentation.layout.plan is a real healthy CapabilityBus skill',async()=>{
  const bus=new CapabilityBus();
  registerPresentationCapabilities(bus);
  const health=await bus.refreshHealth('presentation.layout.plan');
  assert.equal(health.health,'HEALTHY');
  const result=await bus.execute('presentation.layout.plan',{kind:'report'},{owner:'owner',permissions:[],requestId:'presentation-test'});
  assert.equal(result.schema,'mel.presentation-layout/v1');
  assert.equal(result.profile.id,'report');
  assert.equal(result.profile.title_policy,'required');
});
