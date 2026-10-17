import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { injectEvolutionPreflightCapability, inferSelfStateIntent } from '../src/evolution/chat-intent.js';
import { INSTRUCTION_PROMPT_CHARS } from '../src/api/native-chat.js';

const LONG_PROMPT = '# MEL WORK — CONTINUATION AUTONOME\n\nMEL, poursuis maintenant ta préparation au travail rémunéré. Tu dois avancer sur tes travaux en cours, vérifier l’état de ton implémentation, puis me proposer concrètement les prochaines actions, sans me réciter ton statut ni recommencer l’analyse générale. Réponds avec un plan précis et exécutable.';

test('a long instruction is not keyword-routed to a status tool (it reaches the model)', async () => {
  assert.ok(LONG_PROMPT.length > INSTRUCTION_PROMPT_CHARS);
  const request = new Request('https://mel.test/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: LONG_PROMPT }) });
  const routed = await injectEvolutionPreflightCapability(request, {});
  assert.equal(routed, request, 'request passes through unchanged');
  assert.equal((await routed.json()).capability, undefined);
});

test('a short explicit status question still gets its verified status tool', () => {
  assert.deepEqual(inferSelfStateIntent('quels sont tes travaux en cours ?'), { id: 'self.state', input: {} });
});

test('a canned status sheet never replaces the model answer to a long instruction', async () => {
  const source = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  assert.match(source, /const groundedResponseText = instructionPrompt && modelResponseText\.trim\(\)\n\s*\? modelResponseText/);
  assert.match(source, /: instructionPrompt\n\s*\? null\n\s*: inferredExecutionCapability/);
});
