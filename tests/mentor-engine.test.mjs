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

test('mentor applies one unique edit onto the inspected file instead of requiring the whole file', async () => {
  const source = 'export function read() {\n  return "old";\n}\n';
  const engine = new MentorEngine({
    providerFactory: async () => [provider('editor', {
      summary: 'Remplace la valeur lue.',
      edits: [{ path: 'src/example.js', find: 'return "old";', replace: 'return "new";' }],
      tests: ['test:smoke'],
      confidence: 0.8,
    })],
  });
  const result = await engine.propose({
    env: {},
    goal: 'Changer la valeur lue',
    inspectedFiles: [{ path: 'src/example.js', content: source }],
  });
  assert.equal(result.proposal.changes.length, 1);
  assert.equal(result.proposal.changes[0].content, 'export function read() {\n  return "new";\n}\n');
});

test('mentor fits each provider prompt budget and edits the complete long file, not the excerpt', async () => {
  const tail = Array.from({ length: 4000 }, (_, i) => `export const keep${i} = ${i};`).join('\n');
  const source = `export function read() {\n  return "old";\n}\n${tail}\n`;
  assert.ok(source.length > 100_000);
  const calls = [];
  const edit = {
    summary: 'Remplace la valeur lue.',
    edits: [{ path: 'src/native-chat.js', find: 'return "old";', replace: 'return "new";' }],
    tests: ['test:smoke'],
    confidence: 0.8,
  };
  const pc = { ...sequenceProvider('pc', [edit], calls), providerId: 'local-companion-ai' };
  const cloud = sequenceProvider('cloud', [new Error('provider down')], calls);
  const engine = new MentorEngine({ providerFactory: async () => [cloud, pc] });
  const result = await engine.propose({
    env: {},
    goal: 'Changer la valeur lue',
    inspectedFiles: [{ path: 'src/native-chat.js', content: source }],
  });
  const prompt = call => String(call.input?.input ?? call.input);
  // The paired PC rejects any message above 12 000 chars (SOVEREIGNTY_AI_MESSAGE_TOO_LARGE).
  assert.ok(prompt(calls.find(call => call.id === 'pc')).length <= 12_000);
  assert.ok(prompt(calls.find(call => call.id === 'cloud')).length <= 40_000);
  assert.match(prompt(calls.find(call => call.id === 'pc')), /EXTRAIT TRONQUÉ/);
  const [change] = result.proposal.changes;
  assert.equal(change.content.length, source.length, 'the rest of the file is preserved');
  assert.ok(change.content.includes('return "new";') && change.content.endsWith(`keep3999 = 3999;\n`));
});

test('mentor rejects an edit that is not unique in the inspected file', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [provider('editor', {
      edits: [{ path: 'src/example.js', find: 'same', replace: 'other' }],
    })],
  });
  await assert.rejects(() => engine.propose({
    env: {},
    goal: 'Ne pas appliquer un extrait ambigu',
    inspectedFiles: [{ path: 'src/example.js', content: 'same\nsame\n' }],
  }), error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL' && error.failures[0].error === 'MENTOR_INVALID_CHANGE');
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

test('mentor refuses a full rewrite of a long inspected file and a repeated missing import', async () => {
  const long = 'export const value = 1;\n'.repeat(300);
  const engine = new MentorEngine({
    providerFactory: async () => [provider('rewriter', {
      summary: 'Réécrit le fichier.',
      changes: [{ path: 'src/roadmap/master-roadmap.js', content: long + 'export const extra = 1;\n', reason: 'fichier entier' }],
      tests: ['test:smoke'],
    })],
  });
  await assert.rejects(() => engine.propose({
    env: {},
    goal: 'Corriger la roadmap',
    inspectedFiles: [{ path: 'src/roadmap/master-roadmap.js', content: long }],
  }), error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL' && error.failures[0].error === 'MENTOR_LONG_FILE_REQUIRES_EDIT');

  const repeat = new MentorEngine({
    providerFactory: async () => [provider('importer', {
      summary: 'Garde googleapis.',
      changes: [{ path: 'src/evolution/google-tools.js', content: "import { google } from 'googleapis';\nexport const ready = true;\n", reason: 'client' }],
      tests: ['test:smoke'],
    })],
  });
  await assert.rejects(() => repeat.propose({
    env: {},
    goal: 'Corriger l’import',
    inspectedFiles: [{ path: 'src/evolution/google-tools.js', content: "import { google } from 'googleapis';\n" }],
    previousAttempts: [{ error: 'Unresolved import in src/evolution/google-tools.js: googleapis' }],
  }), error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL' && error.failures[0].error === 'MENTOR_REPEATED_BROKEN_IMPORT');
});

test('mentor cannot invent a file that was not inspected', async () => {
  const engine = new MentorEngine({
    providerFactory: async () => [provider('inventor', {
      summary: 'Crée un module google.',
      changes: [{ path: 'src/evolution/google-tools.js', content: "import { google } from 'googleapis';\nexport const ready = true;\n", reason: 'nouveau' }],
      tests: ['test:smoke'],
    })],
  });
  await assert.rejects(() => engine.propose({
    env: {},
    goal: 'Prouver une lecture Gmail',
    inspectedFiles: [{ path: 'src/connectors/gmail.js', content: 'export function list() { return []; }\n' }],
  }), error => error.code === 'MENTOR_NO_VALID_CODE_PROPOSAL' && error.failures[0].error === 'MENTOR_UNINSPECTED_PATH');
});

test('a rejected uninspected file is not fed back; the repair edits the inspected file', async () => {
  const calls = [];
  const source = 'export function list() {\n  return [];\n}\n';
  const engine = new MentorEngine({
    providerFactory: async () => [sequenceProvider('editor', [
      {
        summary: 'Nouveau module.',
        changes: [{ path: 'src/evolution/google-tools.js', content: "import { google } from 'googleapis';\n", reason: 'inventé' }],
      },
      {
        summary: 'Lit la boîte avec le connecteur déjà inspecté.',
        edits: [{ path: 'src/connectors/gmail.js', find: 'return [];', replace: 'return ["inbox"];' }],
        tests: ['test:smoke'],
      },
    ], calls)],
  });
  const result = await engine.propose({
    env: {},
    goal: 'Prouver une lecture Gmail',
    inspectedFiles: [{ path: 'src/connectors/gmail.js', content: source }],
  });
  assert.equal(result.proposal.changes[0].path, 'src/connectors/gmail.js');
  assert.match(result.proposal.changes[0].content, /inbox/);
  const repair = String(calls[1].input?.input || '');
  assert.doesNotMatch(repair, /googleapis/);
  assert.match(repair, /src\/connectors\/gmail\.js/);
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
    inspectedFiles: [{ path: 'src/first.js', content: 'export const first = false;\n' }, { path: 'src/second.js', content: 'export const second = false;\n' }],
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
      inspectedFiles: [{ path: 'src/first.js', content: 'export const first = false;\n' }, { path: 'src/second.js', content: 'export const second = false;\n' }],
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
    inspectedFiles: [{ path: 'src/first.js', content: 'export const first = false;\n' }, { path: 'src/second.js', content: 'export const second = false;\n' }],
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

// ChatGPT-GPT6 / MEL-MENTOR-FALLBACK regression tests.
test('mentor falls back after three provider outages without retrying the same outage as a repair', async () => {
  const calls = [];
  const offline = id => sequenceProvider(id, [Object.assign(new Error('offline'), { code: 'MENTOR_PROVIDER_FAILED' })], calls);
  const working = sequenceProvider('fourth-working', [{
    summary: 'Small valid change from an alternate zero-cost model',
    edits: [{ path: 'src/example.js', find: 'false', replace: 'true' }],
    confidence: 0.9,
    tests: ['test:smoke'],
  }], calls);
  const engine = new MentorEngine({
    providerFactory: async () => [offline('first'), offline('second'), offline('third'), working],
  });
  const result = await engine.propose({
    env: {}, goal: 'Make an inspected file ready',
    inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
  });
  assert.equal(result.proposal.changes[0].content, 'export const ready = true;\n');
  assert.deepEqual(result.council.providers_attempted, ['first', 'second', 'third', 'fourth-working']);
  assert.equal(result.council.selected_provider, 'fourth-working');
  assert.equal(result.council.structured_repair_attempted, false);
  assert.equal(calls.length, 4);
});

test('mentor does not invoke fallback models when its first wave already contains valid code', async () => {
  const calls = [];
  const first = sequenceProvider('first-valid', [{
    summary: 'Existing provider worked',
    edits: [{ path: 'src/example.js', find: 'false', replace: 'true' }],
    tests: ['test:smoke'],
  }], calls);
  const backup = sequenceProvider('fallback-unused', [new Error('must not be called')], calls);
  const engine = new MentorEngine({
    providerFactory: async () => [first, provider('bad-a', 'not-json'), provider('bad-b', 'not-json'), backup],
  });
  const result = await engine.propose({
    env: {}, goal: 'Make an inspected file ready',
    inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
  });
  assert.deepEqual(result.council.providers_attempted, ['first-valid', 'bad-a', 'bad-b']);
  assert.equal(result.council.selected_provider, 'first-valid');
  assert.equal(calls.length, 1);
});

 
// ChatGPT-GPT6 / MEL-MENTOR-TIMEOUT: deadline regressions, removable with this PR.
test('mentor advances to a fourth model when the first three hang indefinitely', async () => {
  const hung = id => ({ id, providerId: 'test', modelId: id, invoke: () => new Promise(() => {}) });
  const good = provider('fallback-good', {
    summary: 'Timeout recovery generated a valid inspected-file edit.',
    edits: [{ path: 'src/example.js', find: 'false', replace: 'true' }],
    tests: ['test:smoke'],
  });
  const engine = new MentorEngine({
    providerFactory: async () => [hung('hang1'), hung('hang2'), hung('hang3'), good],
    invokeTimeoutMs: 15,
    repairTimeoutMs: 15,
  });
  const result = await engine.propose({
    env: {}, jobId: 'timeout-fallback', goal: 'Recover a healthy coding model',
    inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
  });
  assert.equal(result.proposal.changes[0].content, 'export const ready = true;\n');
  assert.deepEqual(result.council.providers_attempted, ['hang1', 'hang2', 'hang3', 'fallback-good']);
  assert.equal(result.council.selected_provider, 'fallback-good');
  assert.deepEqual(result.council.rejected_proposals.map(x => x.error), [
    'MENTOR_PROVIDER_TIMEOUT', 'MENTOR_PROVIDER_TIMEOUT', 'MENTOR_PROVIDER_TIMEOUT',
  ]);
});

test('mentor bounds structured repair and advances after a hung repair wave', async () => {
  const calls = [0, 0, 0];
  const malformed = index => ({
    id: 'bad-' + index, providerId: 'test', modelId: 'bad-' + index,
    invoke: async () => {
      calls[index] += 1;
      return calls[index] === 1 ? { text: '{invalid-json' } : new Promise(() => {});
    },
  });
  const good = provider('backup-good', {
    summary: 'Alternate model survives blocked structured repair.',
    edits: [{ path: 'src/example.js', find: 'false', replace: 'true' }],
    tests: ['test:smoke'],
  });
  const engine = new MentorEngine({
    providerFactory: async () => [malformed(0), malformed(1), malformed(2), good],
    invokeTimeoutMs: 15,
    repairTimeoutMs: 15,
  });
  const result = await engine.propose({
    env: {}, goal: 'Recover from three malformed responses',
    inspectedFiles: [{ path: 'src/example.js', content: 'export const ready = false;\n' }],
  });
  assert.equal(result.council.selected_provider, 'backup-good');
  assert.equal(result.council.structured_repair_attempted, true);
  assert.ok(result.council.rejected_proposals.some(x =>
    x.stage === 'repair' && x.error === 'MENTOR_PROVIDER_TIMEOUT'));
  assert.deepEqual(calls, [2, 2, 2]);
});

// ChatGPT-GPT6 / MEL-MENTOR-SCOPE: demonstrate that model context is small,
// faithful, and the instructions produce a usable patch on inspected sources.
test('mentor prompt contains a bounded inspected excerpt and one patch format', async () => {
  const calls = [];
  const prefix = 'export const target = false;\n';
  const hidden = 'export const SECRET_TAIL_SENTINEL = 12345;\n';
  const source = prefix + '// inspected filler, preserved by the edit\n'.repeat(350) + hidden;
  const model = sequenceProvider('patch-author', [{
    summary: 'A small real inspected change',
    edits: [{ path: 'src/example.js', find: 'export const target = false;', replace: 'export const target = true;' }],
    tests: ['test:smoke'],
  }], calls);
  const engine = new MentorEngine({ providerFactory: async () => [model] });
  const result = await engine.propose({
    env: {}, goal: 'Enable the target safely',
    inspectedFiles: [{ path: 'src/example.js', content: source }],
  });
  const prompt = String(calls[0].input.input);
  assert.match(prompt, /FORMAT OBLIGATOIRE/);
  assert.match(prompt, /"edits"/);
  assert.doesNotMatch(prompt, /SECRET_TAIL_SENTINEL/);
  assert.match(prompt, /EXTRAIT PARTIEL/);
  assert.ok(prompt.length < 12500);
  assert.ok(result.proposal.changes[0].content.includes('export const target = true;'));
  assert.ok(result.proposal.changes[0].content.includes(hidden), 'full inspected file preserved when applying edit');
});

test('mentor structured repair receives the same unambiguous bounded format', async () => {
  const calls = [];
  const source = 'export const enabled = false;\n';
  const model = sequenceProvider('repair-author', ['No JSON here', {
    summary: 'Fix bad response with a real edit',
    edits: [{ path: 'src/example.js', find: 'false', replace: 'true' }],
    tests: ['test:smoke'],
  }], calls);
  const engine = new MentorEngine({ providerFactory: async () => [model] });
  const result = await engine.propose({
    env: {}, goal: 'Enable inspected setting',
    inspectedFiles: [{ path: 'src/example.js', content: source }],
  });
  assert.equal(result.council.selected_from_repair, true);
  assert.match(String(calls[1].input.input), /FORMAT UNIQUE/);
  assert.match(String(calls[1].input.input), /RÉPONSE_INVALIDE_À_RÉPARER/);
  assert.equal(result.proposal.changes[0].content, 'export const enabled = true;\n');
});

test('CODE council exhausts eligible independent coder proposals for a difficult repair', async () => {
  const calls = [];
  const good = i => ({
    summary: 'Solution de code indépendante ' + i,
    edits: [{ path: 'src/example.js', find: 'value = 1', replace: 'value = ' + i }],
    tests: ['test:smoke'], confidence: 0.8,
  });
  const engine = new MentorEngine({
    providerFactory: async () => [
      sequenceProvider('coder-a', [good(2)], calls),
      sequenceProvider('coder-b', [good(3)], calls),
      sequenceProvider('coder-c', [good(4)], calls),
      sequenceProvider('coder-d', [good(5)], calls),
    ],
  });
  const result = await engine.propose({
    env: {}, goal: 'Réparer un cas épineux avec plusieurs modèles CODE',
    mode: 'repair',
    inspectedFiles: [{ path: 'src/example.js', content: 'export const value = 1;\n' }],
  });
  assert.equal(result.code_council.triggered, true);
  assert.equal(result.code_council.valid_proposals, 4);
  assert.equal(result.code_council.attempted.length, 4);
  assert.equal(calls.length, 4);
});

test('ordinary Mentor stops after a valid initial wave without deep CODE council', async () => {
  const calls = [];
  const good = {
    summary:'Simple correction',
    edits:[{ path:'src/example.js', find:'value = 1', replace:'value = 2' }],
    tests:['test:smoke'],
  };
  const engine = new MentorEngine({ providerFactory: async () => [
    sequenceProvider('coder-a',[good],calls),
    sequenceProvider('coder-b',[good],calls),
    sequenceProvider('coder-c',[good],calls),
    sequenceProvider('coder-d',[good],calls),
  ] });
  const result = await engine.propose({
    env:{}, goal:'Correction simple',
    inspectedFiles:[{path:'src/example.js',content:'export const value = 1;\n'}],
  });
  assert.equal(result.code_council.triggered,false);
  assert.equal(calls.length,3);
});

test('mentor gives each model 50 s but keeps the whole proposal inside its time budget', async () => {
  let clock = 0;
  const timeouts = [];
  const slow = id => ({ id, providerId: 'test', modelId: id, async invoke() { clock += 60_000; throw Object.assign(new Error('timeout'), { code: 'MENTOR_PROVIDER_TIMEOUT' }); } });
  const engine = new MentorEngine({
    now: () => clock,
    providerFactory: async () => [slow('a'), slow('b'), slow('c'), slow('d'), slow('e'), slow('f')],
  });
  assert.equal(engine.invokeTimeoutMs, 50_000, 'Workers AI code answers need more than 25 s');
  assert.equal(engine.proposeBudgetMs, 75_000, 'a proposal stays inside the 90 s runtime lease');
  await assert.rejects(engine.propose({ env: {}, goal: 'Changer la valeur lue', inspectedFiles: [{ path: 'src/example.js', content: 'export const a = 1;\n' }] }), (error) => {
    const codes = (error.failures || []).map(row => row.error);
    assert.ok(codes.includes('MENTOR_TIME_BUDGET_EXHAUSTED'), JSON.stringify(codes));
    assert.equal((error.failures || []).filter(row => row.provider === 'd').length, 0, 'the second wave never starts past the budget');
    return true;
  });
});

test('a rejected proposal keeps a short reason: the refused path or the start of the reply', async () => {
  const engine = new MentorEngine({ providerFactory: async () => [
    provider('prose', 'Je pense qu’il faudrait modifier le superviseur pour gérer le bail.'),
    provider('denied', { changes: [{ path: '.env', content: 'X=1' }] }),
  ] });
  await assert.rejects(engine.propose({ env: {}, goal: 'Changer la valeur lue', inspectedFiles: [{ path: 'src/example.js', content: 'export const a = 1;\n' }] }), (error) => {
    const byProvider = Object.fromEntries((error.failures || []).filter(row => row.stage === 'initial').map(row => [row.provider, row.detail]));
    assert.match(byProvider.prose, /^reply=Je pense qu’il faudrait/);
    assert.match(byProvider.denied, /^path=\.env/);
    return true;
  });
});

test('mentor rejects an edit that leaves the inspected file unchanged and hides the manifest status list', async () => {
  const source = "const ORDER = [\n  'MEL-MANIFEST-05',\n];\n";
  const calls = [];
  const engine = new MentorEngine({
    providerFactory: async () => [sequenceProvider('noop', [{
      summary: 'Correction de la duplication de MEL-MANIFEST-05.',
      edits: [{ path: 'src/order.js', find: "  'MEL-MANIFEST-05',\n", replace: "  'MEL-MANIFEST-05',\n" }],
    }], calls)],
  });
  await assert.rejects(() => engine.propose({
    env: {},
    goal: '[MEL-FOUNDER-05] Livrer un travail | OBJECTIF MEL-FOUNDER-01:IN_PROGRESS MEL-MANIFEST-05:PLANNED',
    inspectedFiles: [{ path: 'src/order.js', content: source }],
  }), error => {
    assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
    assert.ok(error.failures.some(failure => failure.error === 'MENTOR_NO_OP_CHANGE'));
    return true;
  });
  assert.ok(calls.length > 0);
  for (const call of calls) {
    const prompt = JSON.stringify(call.input);
    assert.ok(prompt.includes('[MEL-FOUNDER-05] Livrer un travail'));
    assert.ok(!prompt.includes('MEL-FOUNDER-01:IN_PROGRESS'));
  }
});

test('mentor refuses workflow edits the Bridge token cannot push', async () => {
  const engine = new MentorEngine({ providerFactory: async () => [provider('workflow', {
    edits: [{ path: '.github/workflows/restore.yml', find: 'name: old', replace: 'name: new' }],
  })] });
  await assert.rejects(() => engine.propose({ env: {}, goal: 'Prouver une restauration', inspectedFiles: [{ path: '.github/workflows/restore.yml', content: 'name: old\n' }] }), error => {
    assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
    return true;
  });
});

test('mentor rejects a relative import to a file missing from the repository', async () => {
  const exists = new Set(['src/core/existing.js']);
  const engine = new MentorEngine({ providerFactory: async () => [provider('importer', {
    edits: [{ path: 'src/core/runtime.js', find: 'export const a = 1;', replace: "import { b } from '../capabilities/missing.js';\nimport { c } from './existing.js';\nexport const a = b + c;" }],
  })] });
  await assert.rejects(() => engine.propose({ env: {}, goal: 'Ajouter un import', pathExists: async path => exists.has(path), inspectedFiles: [{ path: 'src/core/runtime.js', content: 'export const a = 1;\n' }] }), error => {
    assert.equal(error.code, 'MENTOR_NO_VALID_CODE_PROPOSAL');
    assert.ok(error.failures.some(failure => failure.error === 'MENTOR_MISSING_IMPORT' && failure.detail === 'path=src/capabilities/missing.js'));
    return true;
  });
});

test('mentor resolves an edit excerpt copied with different indentation when it is unique', async () => {
  const source = 'export function read() {\n    const value = 1;\n    return value;\n}\n';
  const engine = new MentorEngine({ providerFactory: async () => [provider('indent', {
    edits: [{ path: 'src/example.js', find: 'const value = 1;\n  return value;', replace: '    const value = 2;\n    return value;' }],
  })] });
  const result = await engine.propose({ env: {}, goal: 'Changer la valeur', inspectedFiles: [{ path: 'src/example.js', content: source }] });
  assert.equal(result.proposal.changes[0].content, 'export function read() {\n    const value = 2;\n    return value;\n}\n');
});
