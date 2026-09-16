import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';
import { DEVELOPMENT_EXPERIENCE_PACK } from '../src/learning/development-experience-pack.js';
import { LearningEngine } from '../src/learning/learning-engine.js';
import { XP_CANONICAL_FILE, createAgentExperience, formatExperienceHandoff, validateAgentExperience } from '../src/learning/agent-xp-protocol.js';
import { MULTI_AI_PROTOCOL, buildMultiPageResumePrompt, createMultiAiHandoff, validateMultiAiHandoff } from '../src/coordination/multi-ai-protocol.js';

class MemoryStub {
  async recent() { return []; }
}

test('root AGENTS entrypoint exposes canonical multi-page and XP protocols', async () => {
  const root = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
  const resume = await readFile(new URL('../.agents/MULTI_PAGE_RESUME.md', import.meta.url), 'utf8');
  const xp = await readFile(new URL('../.agents/XP_PROTOCOL.md', import.meta.url), 'utf8');
  const index = await readFile(new URL('../.agents/DEVELOPMENT_EXPERIENCE_INDEX.md', import.meta.url), 'utf8');

  assert.match(root, /candidate\/mel-clean-autonomy/);
  assert.match(root, /MULTI_PAGE_RESUME\.md/);
  assert.match(root, /XP_PROTOCOL\.md/);
  assert.match(resume, /celui qui finit réellement/i);
  assert.match(resume, /ne force jamais/i);
  assert.match(xp, /development-experience-pack\.js/);
  assert.match(xp, /validated: true/);
  assert.match(index, /bootstrap-multi-ai-orchestrator-20260916/);
});

test('multi-AI protocol produces a collision-safe resume prompt and auditable handoff', () => {
  assert.equal(MULTI_AI_PROTOCOL.canonicalCandidate, 'candidate/mel-clean-autonomy');
  assert.equal(MULTI_AI_PROTOCOL.canonicalRelease, 'release/mel-2026-09-10-r3-3');
  const prompt = buildMultiPageResumePrompt({ scope: 'continuer GEN2 sans collision' });
  assert.match(prompt, /candidate\/mel-clean-autonomy/);
  assert.match(prompt, /release\/mel-2026-09-10-r3-3/);
  assert.match(prompt, /aucune force-update/i);
  assert.match(prompt, /priorité au déploiement/i);
  assert.match(prompt, /XP_PROTOCOL\.md/);

  const handoff = createMultiAiHandoff({
    item: 'GEN2-XX',
    status: 'DONE_VERIFIED',
    sourceSha: '0123456789abcdef',
    files: ['src/example.js'],
    proofs: ['full CI: success'],
    xpIds: ['bootstrap-example'],
  });
  assert.equal(validateMultiAiHandoff(handoff).ok, true);
  assert.equal(validateMultiAiHandoff(createMultiAiHandoff({ item: 'GEN2-XX' })).ok, false);
});

test('XP helper enforces canonical evidence-bearing records', () => {
  assert.equal(XP_CANONICAL_FILE, 'src/learning/development-experience-pack.js');
  const invalid = validateAgentExperience({ id: 'incomplete', validated: true, tests: [] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.includes('validated:requires-proof'));

  const row = createAgentExperience({
    id: 'bootstrap-test-only',
    domain: 'testing',
    task: 'Prouver le protocole XP.',
    input: 'Un agent termine un lot.',
    before: 'Oublier la preuve.',
    after: 'Attacher une preuve.',
    rationale: 'La preuve rend la leçon auditable.',
    tests: ['unit proof'],
    tags: ['xp', 'test'],
    validated: true,
  });
  const handoff = formatExperienceHandoff(row);
  assert.equal(handoff.id, row.id);
  assert.equal(handoff.file, XP_CANONICAL_FILE);
  assert.equal(handoff.validated, true);
});

test('development experience pack is deduplicated and available to MEL training', async () => {
  const ids = BOOTSTRAP_CORRECTIONS.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(DEVELOPMENT_EXPERIENCE_PACK.length >= 8);

  const required = [
    'bootstrap-multi-ai-orchestrator-20260916',
    'bootstrap-agent-xp-handoff-protocol-20260916',
    'bootstrap-non-idle-blocker-escape-20260916',
    'bootstrap-capability-proof-levels-20260916',
    'bootstrap-observation-boundary-20260916',
    'bootstrap-post-deploy-proof-chain-20260916',
    'bootstrap-provider-neutral-explicit-binding-20260916',
    'bootstrap-roadmap-same-lot-truth-20260916',
  ];
  for (const id of required) assert.ok(ids.includes(id), `missing ${id}`);

  const engine = new LearningEngine({ memory: new MemoryStub() });
  const corrections = await engine.corrections({ limit: 500 });
  const bundle = await engine.trainingBundle({ minQuality: 0.95, limit: 500 });
  for (const id of required) {
    assert.ok(corrections.some(row => row.id === id), `corrections missing ${id}`);
    const pair = bundle.preference.find(row => row.id === id);
    assert.ok(pair, `training bundle missing ${id}`);
    const lesson = DEVELOPMENT_EXPERIENCE_PACK.find(row => row.id === id);
    assert.equal(pair.chosen, lesson.after);
    assert.equal(pair.rejected, lesson.before);
  }
});
