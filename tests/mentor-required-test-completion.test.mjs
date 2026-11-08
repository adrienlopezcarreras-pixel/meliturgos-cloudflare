import test from 'node:test';
import assert from 'node:assert/strict';
import { MentorEngine } from '../src/learning/mentor-engine.js';

const path = 'src/math.js';
const source = 'export function double(x) {\n  return x;\n}\n';
const edit = JSON.stringify({ summary: 'Double', edits: [{ path, find: 'return x;', replace: 'return x * 2;' }] });
const testBlock = ['EDIT tests/math-double.test.mjs', '<<<<<<< SEARCH', '=======',
  "import test from 'node:test';", "import assert from 'node:assert/strict';",
  "import { double } from '../src/math.js';",
  "test('double', () => assert.equal(double(2), 4));", '>>>>>>> REPLACE'].join('\n');
function engine(replies, inputs) {
  return new MentorEngine({ providerFactory: async () => [{ id: 'fixture', providerId: 'fixture', modelId: 'fixture',
    async invoke({ input }) { inputs.push(input); return { text: replies[Math.min(inputs.length - 1, replies.length - 1)] }; },
  }] });
}
const request = { env: {}, goal: 'Double the value with regression test', inspectedFiles: [{ path, content: source }], requireTest: true };

test('JSON code and a separate test are composed without mixing response formats', async () => {
  const inputs = [];
  const result = await engine([edit, testBlock], inputs).propose(request);
  assert.equal(inputs.length, 2);
  assert.deepEqual(result.proposal.changes.map(c => c.path), [path, 'tests/math-double.test.mjs']);
  assert.match(result.proposal.changes[0].content, /return x \* 2/);
  assert.equal(result.council.selected_from_repair, false);
});

test('a valid structured repair can receive its missing test within the same budget', async () => {
  const inputs = [];
  const result = await engine(['not JSON or a proposal', edit, testBlock], inputs).propose(request);
  assert.equal(inputs.length, 3);
  assert.match(inputs[2], /n’a pas de test/);
  assert.equal(result.council.selected_from_repair, true);
  assert.equal(result.proposal.changes.length, 2);
});

test('test completion cannot replace the already validated implementation', async () => {
  const inputs = [];
  await assert.rejects(engine([edit, edit], inputs).propose(request), e => e.code === 'MENTOR_NO_VALID_CODE_PROPOSAL');
});

test('test completion still rejects paths outside the roadmap contract', async () => {
  const inputs = [];
  await assert.rejects(engine([edit, testBlock], inputs).propose({ ...request,
    allowedPaths: [path, 'tests/required-contract.test.mjs'],
  }), e => e.code === 'MENTOR_NO_VALID_CODE_PROPOSAL');
});

test('completion preserves the aggregate change limit', async () => {
  const inputs = [];
  const tenTests = Array.from({ length: 10 }, (_, i) => testBlock.replace('math-double.test.mjs', `math-double-${i}.test.mjs`)).join('\n');
  await assert.rejects(engine([edit, tenTests], inputs).propose(request), e => e.code === 'MENTOR_NO_VALID_CODE_PROPOSAL');
});

test('an invalid test is never attached to an otherwise valid implementation', async () => {
  const inputs = [];
  const brokenTest = testBlock.replace('assert.equal(double(2), 4)', 'assert.equal(double(2), ); ???');
  await assert.rejects(engine([edit, brokenTest], inputs).propose(request), e => e.code === 'MENTOR_NO_VALID_CODE_PROPOSAL');
});

test('completion does not start when the global budget cannot reserve a test call', async () => {
  const inputs = [];
  const mentor = engine([edit], inputs);
  mentor.proposeBudgetMs = 100;
  await assert.rejects(mentor.propose(request), e => e.code === 'MENTOR_NO_VALID_CODE_PROPOSAL');
  assert.ok(inputs.every(input => !/n’a pas de test/.test(input)));
});
