import test from 'node:test';
import assert from 'node:assert/strict';
import { MentorEngine } from '../src/learning/mentor-engine.js';

const path = 'src/pages/objective-panel-runtime.js';
const source = 'export function activityState() {\n  return "TEACHER_APPROVED";\n}\n';
const refused = {
  summary: 'Guessed an uninspected line.',
  edits: [{ path, find: 'return "CANCELLED";', replace: 'return "READY";' }],
  tests: ['test:smoke'],
};
const corrected = {
  summary: 'Replace the exact visible line.',
  edits: [{ path, find: 'return "TEACHER_APPROVED";', replace: 'return "READY";' }],
  tests: ['test:smoke'],
};

function mentorFromReplies(replies, inputs) {
  const provider = {
    id: 'code-model-fixture',
    providerId: 'fixture',
    modelId: 'fixture',
    async invoke({ input }) {
      inputs.push(String(input));
      const reply = replies[Math.min(inputs.length - 1, replies.length - 1)];
      return { text: JSON.stringify(reply), provenance: { provider: 'fixture', model: 'fixture' } };
    },
  };
  return new MentorEngine({ providerFactory: async () => [provider] });
}

test('Mentor repairs an uninspected SEARCH from exact refusal detail without replaying the rejected JSON', async () => {
  const inputs = [];
  const mentor = mentorFromReplies([refused, corrected], inputs);
  const result = await mentor.propose({
    env: {},
    jobId: 'mel-ui-audit-03-fixture',
    goal: 'Make activity status reflect the approved plan',
    inspectedFiles: [{ path, content: source }],
  });
  assert.equal(inputs.length, 2, 'one initial attempt and one bounded structured repair');
  assert.match(inputs[1], /MENTOR_UNINSPECTED_EDIT/);
  assert.match(inputs[1], /DÉTAIL DU REFUS/);
  assert.match(inputs[1], /ligne introuvable/);
  assert.match(inputs[1], /CANCELLED/);
  assert.match(inputs[1], /Recopie un bloc SEARCH contigu/);
  assert.doesNotMatch(inputs[1], /RÉPONSE_INVALIDE_À_RÉPARER:/,
    'the rejected model reply is evidence, not a template for another fabricated edit');
  assert.equal(result.proposal.changes[0].content,
    'export function activityState() {\n  return "READY";\n}\n');
  assert.equal(result.council.selected_from_repair, true);
});

test('Mentor still fails closed if repair repeats an uninspected SEARCH', async () => {
  const inputs = [];
  const mentor = mentorFromReplies([refused, refused], inputs);
  await assert.rejects(
    mentor.propose({
      env: {}, goal: 'Do not accept invented code', inspectedFiles: [{ path, content: source }],
    }),
    error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL'
      && error.failures.length === 2
      && error.failures.every(row => row.error === 'MENTOR_UNINSPECTED_EDIT'),
  );
  assert.equal(inputs.length, 2);
});
