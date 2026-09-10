import test from 'node:test';
import assert from 'node:assert/strict';
import { MentorEngine, mentorPolicy } from '../src/learning/mentor-engine.js';
import { MentorMemoryRepository } from '../src/learning/mentor-memory.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

function provider(id, payload) {
  return {
    id,
    providerId: 'test',
    modelId: id,
    async invoke() {
      if (payload instanceof Error) throw payload;
      return { text: typeof payload === 'string' ? payload : JSON.stringify(payload), provenance: { provider: 'test', model: id } };
    },
  };
}

test('mentor engine selects a valid multi-provider code proposal and stores the proposal lesson', async () => {
  const DB = sqliteD1();
  try {
    const memory = new MentorMemoryRepository(DB);
    const engine = new MentorEngine({
      memory,
      providerFactory: async () => [
        provider('bad-json', 'not json'),
        provider('coder-a', {
          summary: 'Ajoute le comportement demandé avec un test ciblé.',
          changes: [{ path: 'src/example.js', content: "export const ready = true;\n", reason: 'Implémentation minimale' }],
          tests: ['test:smoke'],
          confidence: 0.91,
          lessons: ['Préserver les contrats existants.'],
          risks: ['Régression possible si le contrat change.'],
        }),
        provider('coder-b', {
          summary: 'Alternative valide.',
          changes: [{ path: 'src/example.js', content: "export const ready = 'alt';\n", reason: 'Alternative' }],
          tests: ['test:smoke'],
          confidence: 0.5,
          lessons: [],
          risks: [],
        }),
      ],
    });

    const result = await engine.propose({
      env: {},
      jobId: 'job-1',
      goal: 'Développer une vraie capacité autonome testable',
      inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
    });

    assert.equal(result.ok, true);
    assert.equal(result.proposal.changes[0].path, 'src/example.js');
    assert.equal(result.proposal.changes[0].content, "export const ready = true;\n");
    assert.deepEqual(result.proposal.tests, ['test:smoke']);
    assert.equal(result.council.valid_proposals, 2);
    assert.equal(result.council.selected_provider, 'coder-a');
    assert.equal(result.policy, 'ZERO_ADDED_COST_FAIL_CLOSED');

    const rows = (await DB.prepare('SELECT * FROM mentor_lessons WHERE job_id=?').bind('job-1').all()).results;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].outcome, 'PROPOSED');
  } finally { DB.close(); }
});

test('mentor engine rejects sensitive and outside-repository paths', async () => {
  const engine = new MentorEngine({ providerFactory: async () => [] });
  await assert.rejects(
    () => engine.propose({ env: {}, goal: 'test', inspectedFiles: [{ path: '../.env', content: 'x' }] }),
    error => error.code === 'MENTOR_PATH_DENIED'
  );
});

test('mentor engine refuses proposals that try to write secrets', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [provider('unsafe', {
      summary: 'bad',
      changes: [{ path: '.env', content: 'TOKEN=x' }],
      tests: ['test:smoke'],
      confidence: 1,
    })],
  });
  await assert.rejects(
    () => engine.propose({ env: {}, goal: 'test', inspectedFiles: [{ path: 'src/example.js', content: 'x' }] }),
    error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL'
  );
});

test('mentor outcome becomes reusable development memory', async () => {
  const DB = sqliteD1();
  try {
    const memory = new MentorMemoryRepository(DB);
    const engine = new MentorEngine({ memory, providerFactory: async () => [] });
    await engine.recordOutcome({
      jobId: 'job-2',
      goal: 'Corriger le bridge',
      outcome: 'SUCCEEDED',
      lesson: 'Après une modification du bridge, lancer le test smoke puis le test intégration.',
      evidence: { tests: ['test:smoke', 'test:integration'] },
      score: 1,
      tags: ['bridge'],
    });
    const context = await memory.context('bridge tests', { limit: 5 });
    assert.equal(context.length, 1);
    assert.equal(context[0].outcome, 'SUCCEEDED');
    assert.match(context[0].lesson, /test smoke/i);
  } finally { DB.close(); }
});

test('mentor policy keeps deployment approval explicit', () => {
  assert.equal(mentorPolicy.deployment_requires_human_approval, true);
  assert.ok(mentorPolicy.allowed_tests.includes('test:integration'));
});
