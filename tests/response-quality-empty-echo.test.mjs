import test from 'node:test';
import assert from 'node:assert/strict';
import { assessResponseQuality, replaceUnusableResponse } from '../src/api/response-quality-audit.js';
import { shouldEscalateNativeChatToCouncil } from '../src/api/native-chat.js';

// Production chat: an empty-looking gemma reply and a qwen reply that only
// repeated the owner's question were shown as MEL's answer.
test('empty-looking and echoed replies are flagged, retried and never shown as an answer', () => {
  for (const reply of ['', '```\n```', '---', ' ​ ']) {
    const assessment = assessResponseQuality({ userText: 'pourquoi elle n’arrive pas au bout', responseText: reply });
    assert.ok(assessment.issues.some(i => i.code === 'EMPTY_RESPONSE'), JSON.stringify(reply));
    assert.match(replaceUnusableResponse(reply, assessment), /réponse vide/);
    assert.equal(shouldEscalateNativeChatToCouncil({ userText: 'oui dis moi', responseText: reply, assessment }), true);
  }
  const question = 'Pourquoi elle n’arrive pas à aller au bout du déploiement ?';
  const echo = assessResponseQuality({
    userText: 'oui dis moi',
    responseText: 'Désolée, j’ai eu un petit bug. ' + question,
    recent: [{ role: 'user', content: question }],
  });
  assert.ok(echo.issues.some(i => i.code === 'ECHOED_USER_TEXT'));
  assert.match(replaceUnusableResponse('x', echo), /reprendre ta question/);
  const answer = assessResponseQuality({
    userText: question,
    responseText: question + ' Parce que la CI de la branche candidate est rouge depuis la fusion de main : la promotion attend.',
  });
  assert.equal(answer.issues.some(i => i.code === 'ECHOED_USER_TEXT'), false, 'quoting the question before answering is fine');
});
