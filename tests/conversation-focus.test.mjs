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
