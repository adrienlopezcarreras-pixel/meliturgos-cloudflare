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

function sequenceProvider(id, payloads, calls) {
  let index = 0;
  return {
    id,
    providerId: 'test',
    modelId: id,
    async invoke(input) {
      calls.push({ id, input });
      const payload = payloads[Math.min(index, payloads.length - 1)];
      index += 1;
      if (payload instanceof Error) throw payload;
      return { text: typeof payload === 'string' ? payload : JSON.stringify(payload), provenance: { provider: 'test', model: id } };
    },
  };
}

test('mentor rejects an oversized proposal instead of silently accepting its first files', async () => {
  const changes = Array.from({ length: mentorPolicy.max_changes + 1 }, (_, index) => ({
    path: `src/example-${index}.js`, content: `export const value = ${index};\n`,
  }));
  const engine = new MentorEngine({ providerFactory: async () => [provider('oversized', { changes })] });
  await assert.rejects(() => engine.propose({ env: {}, goal: 'Preserve the entire proposed change set', inspectedFiles: [{ path: 'src/example-0.js', content: 'export const value = -1;\n' }] }), error => {
    assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
    assert.ok(error.failures.every(failure => failure.error === 'MENTOR_INVALID_CHANGE'));
    return true;
  });
});

test('mentor rejects conflicting duplicate paths instead of dropping the second file', async () => {
  const changes = [
    { path: 'src/example.js', content: 'export const value = 1;\n' },
    { path: 'src/example.js', content: 'export const value = 2;\n' },
  ];
  const engine = new MentorEngine({ providerFactory: async () => [provider('ambiguous', { changes })] });
  await assert.rejects(() => engine.propose({ env: {}, goal: 'Require one complete version per file', inspectedFiles: [{ path: 'src/example.js', content: 'export const value = 0;\n' }] }), error => {
    assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
    assert.ok(error.failures.every(failure => failure.error === 'MENTOR_INVALID_CHANGE'));
    return true;
  });
});

test('mentor engine selects a valid multi-provider code proposal and stores it as an unvalidated observation', async () => {
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
    assert.equal(rows[0].kind, 'EXPERIENCE');
    assert.equal(rows[0].outcome, 'OBSERVED');
    const evidence = JSON.parse(rows[0].evidence_json);
    assert.equal(evidence.experience.validated, false);
    assert.equal(evidence.experience.source_type, 'MENTOR_COUNCIL_CODE_PROPOSAL');
  } finally { DB.close(); }
});

test('mentor engine performs one bounded structured repair pass when every initial proposal is invalid', async () => {
  const calls = [];
  const valid = {
    summary: 'Répare la structure sans élargir le périmètre.',
    changes: [{ path: 'src/example.js', content: 'export const ready = true;\n', reason: 'Petit changement testable' }],
    tests: ['test:smoke'],
    confidence: 0.88,
    lessons: ['Conserver le contrat existant.'],
    risks: ['Régression couverte par le smoke test.'],
  };
  const engine = new MentorEngine({
    providerFactory: async () => [
      sequenceProvider('coder-a', ['pas du json', valid], calls),
      sequenceProvider('coder-b', ['{"summary":"incomplet","changes":[]}', '{"summary":"toujours invalide","changes":[]}'], calls),
    ],
  });

  const result = await engine.propose({
    env: {},
    jobId: 'job-repair',
    goal: 'Corriger un composant existant sans créer de doublon',
    inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.changes[0].path, 'src/example.js');
  assert.equal(result.proposal.changes[0].content, 'export const ready = true;\n');
  assert.equal(result.council.structured_repair_attempted, true);
  assert.equal(result.council.structured_repair_valid_proposals, 1);
  assert.equal(result.council.selected_from_repair, true);
  assert.equal(calls.length, 4);
  assert.match(String(calls[2].input?.input || ''), /RÉPONSE_INVALIDE_À_RÉPARER/);
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


test('mentor may read safe repository context outside writable paths while writes stay restricted', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [provider('coder-safe-context', {
      summary: 'Use read-only roadmap context while changing an allowed source file.',
      changes: [{ path: 'src/example.js', content: 'export const ready = true;\n', reason: 'Allowed implementation path' }],
      tests: ['test:smoke'],
      confidence: 0.9,
    })],
  });

  const result = await engine.propose({
    env: {},
    goal: 'Use existing roadmap context safely',
    inspectedFiles: [
      { path: '.agents/roadmap-note.md', content: '# Read-only context\n' },
      { path: 'src/example.js', content: 'export const ready = false;\n' },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.changes[0].path, 'src/example.js');
});

test('mentor still refuses writing to inspection-only repository paths', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [provider('coder-bad-write', {
      summary: 'Unsafe write target',
      changes: [{ path: '.agents/roadmap-note.md', content: '# changed\n' }],
      tests: ['test:smoke'],
      confidence: 1,
    })],
  });

  await assert.rejects(
    () => engine.propose({
      env: {},
      goal: 'Do not allow writes outside the writable set',
      inspectedFiles: [{ path: '.agents/roadmap-note.md', content: '# context\n' }],
    }),
    error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL'
  );
});


test('mentor accepts a complete delimited file when JSON would break', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [provider('coder-delimited', `SUMMARY Ajoute le client\nTESTS test:smoke\nFILE src/tools/google-client.js\n<<<MEL_FILE\nexport function search() {\n  return [];\n}\nMEL_FILE`)],
  });
  const result = await engine.propose({
    env: {},
    goal: 'Écrire le client Google',
    inspectedFiles: [{ path: 'src/tools/google-client.js', content: 'export function search() { return null; }\n' }],
  });
  assert.equal(result.proposal.changes[0].path, 'src/tools/google-client.js');
  assert.match(result.proposal.changes[0].content, /return \[\]/);
});

test('mentor accepts JSON whose file content contains raw newlines', async () => {
  const raw = '{"summary":"Corrige le client","changes":[{"path":"src/tools/google-client.js","content":"export function search() {\n  return [];\n}\n","reason":"lecture"}],"tests":["test:smoke"]}';
  const engine = new MentorEngine({ providerFactory: async () => [provider('coder-newlines', raw)] });
  const result = await engine.propose({
    env: {},
    goal: 'Écrire le client Google',
    inspectedFiles: [{ path: 'src/tools/google-client.js', content: 'export function search() { return null; }\n' }],
  });
  assert.match(result.proposal.changes[0].content, /return \[\]/);
});

test('mentor refuses a delimited placeholder instead of a complete file', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [provider('coder-placeholder', 'FILE src/example.js\n<<<MEL_FILE\nexport const ready = true;\n// ... existing code\nMEL_FILE')],
  });
  await assert.rejects(
    () => engine.propose({
      env: {},
      goal: 'Ne pas accepter un fichier tronqué',
      inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
    }),
    error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL' && error.failures.some(row => row.error === 'MENTOR_INVALID_CHANGE'),
  );
});

test('mentor failure diagnostics classify malformed JSON without exposing model output', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [sequenceProvider('bad-json', ['not json', 'still not json'], [])],
  });
  await assert.rejects(
    () => engine.propose({
      env: {},
      goal: 'Classify malformed output safely',
      inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
    }),
    error => {
      assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
      assert.deepEqual(error.failures.map(x => x.error), ['MENTOR_JSON_REQUIRED', 'MENTOR_JSON_REQUIRED']);
      return true;
    }
  );
});

test('mentor accepts every complete delimited file with CRLF without changing internal line endings', async () => {
  const firstContent = 'export function first() {\r\n  return true;\r\n}';
  const secondContent = 'export const second = true;';
  const raw = [
    'SUMMARY Two complete files',
    'TESTS test:smoke test:integration',
    'FILE src/first.js',
    '<<<MEL_FILE',
    firstContent,
    'MEL_FILE',
    'FILE src/second.js',
    '<<<MEL_FILE',
    secondContent,
    'MEL_FILE',
  ].join('\r\n');
  const engine = new MentorEngine({ providerFactory: async () => [provider('coder-crlf', raw)] });

  const result = await engine.propose({
    env: {},
    goal: 'Propose two complete files',
    inspectedFiles: [{ path: 'src/first.js', content: 'export const first = false;\n' }],
  });

  assert.deepEqual(result.proposal.changes.map(({ path, content }) => ({ path, content })), [
    { path: 'src/first.js', content: firstContent },
    { path: 'src/second.js', content: secondContent },
  ]);
  assert.deepEqual(result.proposal.tests, ['test:smoke', 'test:integration']);
  assert.equal(result.council.structured_repair_attempted, false);
});

test('mentor rejects the entire delimited proposal when a later file is truncated', async () => {
  const raw = 'FILE src/first.js\n<<<MEL_FILE\nexport const first = true;\nMEL_FILE\nFILE src/second.js\n<<<MEL_FILE\nexport const second =';
  const calls = [];
  const engine = new MentorEngine({ providerFactory: async () => [sequenceProvider('coder-truncated', [raw], calls)] });

  await assert.rejects(
    () => engine.propose({
      env: {},
      goal: 'Reject an incomplete multi-file implementation',
      inspectedFiles: [{ path: 'src/first.js', content: 'export const first = false;\n' }],
    }),
    error => {
      assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
      assert.equal(error.repair_attempted, true);
      assert.deepEqual(error.failures.map(({ error, stage }) => ({ error, stage })), [
        { error: 'MENTOR_INVALID_CHANGE', stage: 'initial' },
        { error: 'MENTOR_INVALID_CHANGE', stage: 'repair' },
      ]);
      return true;
    },
  );
  assert.equal(calls.length, 2);
  assert.match(calls[1].input.input, /ERREUR_DE_VALIDATION: MENTOR_INVALID_CHANGE/);
});

test('mentor repairs an incomplete multi-file response before accepting the full proposal', async () => {
  const raw = 'FILE src/first.js\n<<<MEL_FILE\nexport const first = true;\nMEL_FILE\nFILE src/second.js\n<<<MEL_FILE\nexport const second =';
  const repaired = `${raw} true;\nMEL_FILE`;
  const calls = [];
  const engine = new MentorEngine({ providerFactory: async () => [sequenceProvider('coder-repair-complete', [raw, repaired], calls)] });

  const result = await engine.propose({
    env: {},
    goal: 'Repair a truncated proposal as a whole',
    inspectedFiles: [{ path: 'src/first.js', content: 'export const first = false;\n' }],
  });

  assert.equal(result.council.selected_from_repair, true);
  assert.equal(result.council.structured_repair_valid_proposals, 1);
  assert.deepEqual(result.proposal.changes.map(change => change.path), ['src/first.js', 'src/second.js']);
  assert.equal(result.proposal.changes[1].content, 'export const second = true;');
  assert.equal(calls.length, 2);
});

for (const format of ['json', 'delimited']) {
  test(`mentor rejects a unified diff supplied as a complete ${format} file`, async () => {
    const content = '--- a/src/example.js\n+++ b/src/example.js\n@@ -1 +1 @@\n-export const ready = false;\n+export const ready = true;\n';
    const raw = format === 'json'
      ? JSON.stringify({ changes: [{ path: 'src/example.js', content }] })
      : `FILE src/example.js\n<<<MEL_FILE\n${content}\nMEL_FILE`;
    const engine = new MentorEngine({ providerFactory: async () => [provider(`coder-diff-${format}`, raw)] });

    await assert.rejects(
      () => engine.propose({
        env: {},
        goal: 'Only accept complete source files',
        inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
      }),
      error => {
        assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
        assert.deepEqual(error.failures.map(row => row.error), ['MENTOR_INVALID_CHANGE', 'MENTOR_INVALID_CHANGE']);
        return true;
      },
    );
  });
}
