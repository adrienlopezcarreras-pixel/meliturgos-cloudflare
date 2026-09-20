import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEllipticalFollowUp,
  deriveConversationFocus,
  buildConversationFocusInstruction,
} from '../src/api/conversation-focus.js';

test('short follow-up stays anchored to the latest substantive user request', () => {
  const recent = [
    { role:'user', content:"mais tu ne t'occupe pas de shardvauld, tu t'occupe de la communication de MEL et de ses réponses" },
    { role:'assistant', content:'Je reste sur la communication.' },
    { role:'user', content:'améliore ses réponses, sa cohérence et ses capacités à se connaître' },
    { role:'assistant', content:'Je travaille dessus.' },
  ];
  const focus = deriveConversationFocus(recent, 'avance');
  assert.equal(focus.elliptical, true);
  assert.match(focus.anchor, /améliore ses réponses/i);
  assert.ok(focus.constraints.some(x => /shardvauld/i.test(x)));
  const prompt = buildConversationFocusInstruction(recent, 'avance');
  assert.match(prompt, /Référent résolu/);
  assert.match(prompt, /ne t'occupe pas de shardvauld/i);
  assert.match(prompt, /ne change pas de chantier/i);
});

test('a new explicit request overrides the previous anchor', () => {
  const recent = [
    { role:'user', content:'reste uniquement sur la communication de MEL' },
    { role:'assistant', content:'D’accord.' },
  ];
  const focus = deriveConversationFocus(recent, 'explique-moi le fonctionnement de la mémoire maintenant');
  assert.equal(focus.elliptical, false);
  assert.match(focus.anchor, /fonctionnement de la mémoire/i);
});

test('elliptical detector covers operational follow-ups without swallowing detailed prompts', () => {
  for (const text of ['go', 'continue', 'avance', 'et maintenant ?', 'fais-le', 'maj']) {
    assert.equal(isEllipticalFollowUp(text), true, text);
  }
  assert.equal(isEllipticalFollowUp('améliore la cohérence des réponses de MEL sans toucher à ShardVault'), false);
});


test('persistent focus rescues a short follow-up when recent context is empty', () => {
  const focus = deriveConversationFocus([], 'continue', {
    anchor:'améliore la cohérence des réponses de MEL',
    constraints:['reste uniquement sur la communication de MEL'],
    excluded_topics:['shardvault'],
  });
  assert.equal(focus.elliptical, true);
  assert.equal(focus.anchor_source, 'persisted');
  assert.match(focus.anchor, /cohérence des réponses/i);
  assert.deepEqual(focus.excluded_topics, ['shardvault']);
  assert.equal(focus.needs_clarification, false);
});

test('short follow-up without recent or persisted anchor asks for clarification', () => {
  const focus = deriveConversationFocus([], 'go');
  assert.equal(focus.elliptical, true);
  assert.equal(focus.needs_clarification, true);
  assert.equal(focus.anchor, '');
});

test('explicit permission can release a persisted excluded topic', () => {
  const focus = deriveConversationFocus([], 'tu peux maintenant toucher à ShardVault', {
    anchor:'communication MEL',
    constraints:["ne touche pas à ShardVault"],
    excluded_topics:['shardvault'],
  });
  assert.equal(focus.elliptical, false);
  assert.equal(focus.excluded_topics.includes('shardvault'), false);
});


test('permission reset releases only the named excluded topic when several are persisted', () => {
  const focus=deriveConversationFocus([], 'tu peux maintenant toucher à ShardVault', {
    anchor:'communication MEL',
    constraints:["ne touche pas à ShardVault","ne touche pas à Hardware"],
    excluded_topics:['shardvault','hardware'],
  });
  assert.equal(focus.excluded_topics.includes('shardvault'), false);
  assert.equal(focus.excluded_topics.includes('hardware'), true);
});


test('multiword exclusions preserve the real excluded subject instead of only one token', () => {
  const focus=deriveConversationFocus([], "ne touche pas à la mémoire longue, reste uniquement sur la communication de MEL");
  assert.ok(focus.excluded_topics.includes('memoire longue'));
  assert.equal(focus.excluded_topics.includes('memoire'), false);
});

test('permission reset can release a multiword excluded subject without dropping unrelated exclusions', () => {
  const focus=deriveConversationFocus([], "tu peux maintenant toucher à la mémoire longue", {
    anchor:'communication MEL',
    constraints:["ne touche pas à la mémoire longue","ne touche pas au module hardware"],
    excluded_topics:['memoire longue','module hardware'],
  });
  assert.equal(focus.excluded_topics.includes('memoire longue'), false);
  assert.equal(focus.excluded_topics.includes('module hardware'), true);
});
