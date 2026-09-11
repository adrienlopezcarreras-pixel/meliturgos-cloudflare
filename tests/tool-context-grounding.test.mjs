import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../src/core/orchestrator/context-builder.js';

test('successful code tool results are promoted into trusted runtime context', () => {
  const messages = buildContext({
    system: 'You are MEL.',
    recent: [],
    toolResults: [{ path: 'src/router.js', content: 'export default {}', sha: 'abc', branch: 'release/test', repository: 'owner/repo' }],
    current: 'Peux-tu lire ton code ?'
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /OUTILS EXÉCUTÉS AVEC SUCCÈS/);
  assert.match(messages[0].content, /src\/router\.js/);
  assert.match(messages[0].content, /release\/test/);
  assert.match(messages[0].content, /ne prétends pas que tu n’as pas accès au code/i);
  assert.equal(messages.some(m => m.role === 'tool'), false, 'avoid unsupported bare tool-role messages');
  assert.deepEqual(messages.at(-1), { role: 'user', content: 'Peux-tu lire ton code ?' });
});

test('tool context truncates oversized strings instead of exploding prompt size', () => {
  const huge = 'x'.repeat(12000);
  const messages = buildContext({ system: 'MEL', toolResults: [{ content: huge }], current: 'analyse' });
  assert.match(messages[0].content, /CONTEXTE PARTIEL — \d+ caractères intermédiaires omis/);
  assert.ok(messages[0].content.length < 11500);
});
