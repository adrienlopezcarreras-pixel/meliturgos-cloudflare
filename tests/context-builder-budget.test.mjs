import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, boundRecentMessages, compileHistoricalDecisionCapsule } from '../src/core/orchestrator/context-builder.js';

test('recent context keeps newest messages within budget in chronological order', () => {
  const recent = [
    { role: 'user', content: 'A'.repeat(3000) },
    { role: 'assistant', content: 'B'.repeat(3000) },
    { role: 'user', content: 'C'.repeat(3000) },
  ];
  const bounded = boundRecentMessages(recent, { totalChars: 5000, perMessageChars: 3000 });
  assert.equal(bounded.omitted, 2);
  assert.equal(bounded.messages.length, 1);
  assert.match(bounded.messages[0].content, /^C/);
});

test('oversized historical message keeps both beginning and end', () => {
  const content = `BEGIN-${'x'.repeat(20000)}-END`;
  const bounded = boundRecentMessages([{ role: 'assistant', content }], { totalChars: 6000, perMessageChars: 5000 });
  assert.equal(bounded.messages.length, 1);
  assert.match(bounded.messages[0].content, /^BEGIN-/);
  assert.match(bounded.messages[0].content, /-END$/);
  assert.match(bounded.messages[0].content, /CONTEXTE PARTIEL/);
});

test('buildContext never truncates the current user prompt', () => {
  const current = 'CURRENT-'.repeat(15000);
  const messages = buildContext({
    system: 'system',
    recent: Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `${index}:` + 'z'.repeat(15000) })),
    toolResults: [],
    current,
  });
  assert.equal(messages.at(-1).role, 'user');
  assert.equal(messages.at(-1).content, current);
  assert.match(messages[0].content, /message\(s\) plus ancien\(s\)/);
});

test('buildContext bounds oversized tool results before model routing', () => {
  const messages = buildContext({
    system: 'system',
    toolResults: [{ capability: 'test', status: 'SUCCEEDED', result: { huge: 'q'.repeat(50000) } }],
    current: 'go',
  });
  assert.ok(messages[0].content.length < 25000);
  assert.match(messages[0].content, /CONTEXTE PARTIEL/);
});


test('MEL-CONTEXT-02 preserves an omitted explicit user constraint in the active system context', () => {
  const recent = [
    { role:'user', content:'Décision importante : ne touche pas APK mobile ou MINI. ' + 'a'.repeat(3200) },
    { role:'assistant', content:'Ancien diagnostic sans décision. ' + 'b'.repeat(3200) },
    { role:'user', content:'Message récent opérationnel. ' + 'c'.repeat(3200) },
  ];
  const messages = buildContext({
    system:'system',
    recent,
    current:'continue le backend',
  });
  assert.equal(messages.at(-1).content,'continue le backend');
  assert.match(messages[0].content,/CONTEXTE COMPRESSÉ/);
  assert.match(messages[0].content,/ne touche pas APK mobile ou MINI/i);
  assert.match(messages[0].content,/extraits historiques, pas un résumé inventé/i);
});

test('MEL-CONTEXT-02 keeps contradictory historical corrections in chronological order', () => {
  const capsule = compileHistoricalDecisionCapsule([
    { role:'assistant', content:'État : le déploiement est terminé.' },
    { role:'user', content:'Non, correction : le déploiement est encore en cours.' },
    { role:'user', content:'Désormais il faut valider le smoke avant de continuer.' },
  ]);
  assert.equal(capsule.anchors.length,3);
  const first=capsule.text.indexOf('le déploiement est terminé');
  const correction=capsule.text.indexOf('le déploiement est encore en cours');
  const finalRule=capsule.text.indexOf('valider le smoke');
  assert.ok(first>=0 && correction>first && finalRule>correction);
  assert.match(capsule.text,/correction utilisateur plus récente/i);
});

test('MEL-CONTEXT-02 does not inflate context with omitted filler that has no decision signal', () => {
  const capsule=compileHistoricalDecisionCapsule([
    {role:'user',content:'bonjour comment vas tu aujourd hui'},
    {role:'assistant',content:'voici une explication générale sur un sujet sans décision'},
  ]);
  assert.equal(capsule.text,'');
  assert.deepEqual(capsule.anchors,[]);
});

test('MEL-CONTEXT-02 historical decision capsule stays inside its configured budget', () => {
  const capsule=compileHistoricalDecisionCapsule(
    Array.from({length:50},(_,index)=>({
      role:index%2?'assistant':'user',
      content:`Décision ${index} : il faut garder cette contrainte ${'x'.repeat(500)}.`,
    })),
    {maxChars:1800,maxItems:40}
  );
  assert.ok(capsule.text.length<=1800);
  assert.ok(capsule.anchors.length>0);
  assert.ok(capsule.anchors.length<40);
});


test('MEL-CONTEXT-02 preserves a decision located in the truncated middle of one oversized historical message', () => {
  const historical =
    'début ' + 'a'.repeat(7000)
    + '. Décision : il faut conserver la validation production avant le prochain lot. '
    + 'b'.repeat(7000) + ' fin.';
  const bounded=boundRecentMessages(
    [{role:'user',content:historical}],
    {totalChars:20000,perMessageChars:3000}
  );
  assert.equal(bounded.omitted,0);
  assert.doesNotMatch(bounded.messages[0].content,/validation production avant le prochain lot/i);

  const messages=buildContext({
    system:'system',
    recent:[{role:'user',content:historical}],
    current:'continue',
  });
  assert.match(messages[0].content,/validation production avant le prochain lot/i);
  assert.equal(messages.at(-1).content,'continue');
});
