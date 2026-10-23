import test from 'node:test';
import assert from 'node:assert/strict';
import { stripInternalCounters } from '../src/api/chat-sanitization.js';

test('removes interaction_count sentence from normal MEL reply', () => {
  const input = "Je peux maintenant lire mon code. Et pour répondre à ta question sur le nombre d'échanges, interaction_count : 169";
  const output = stripInternalCounters(input);
  assert.equal(output, 'Je peux maintenant lire mon code.');
  assert.equal(/interaction_count/i.test(output), false);
});

test('leaves normal replies untouched', () => {
  const input = 'Je peux lire mes compétences et continuer à travailler.';
  assert.equal(stripInternalCounters(input), input);
});


test('counter removal preserves Markdown image boundaries and code indentation', () => {
  const input='```markdown\n![portrait](https://example.org/portrait.jpg)\n```\n\n```js\nif (ready) {\n    run();\n}\n```';
  assert.equal(stripInternalCounters(input),input);
});
