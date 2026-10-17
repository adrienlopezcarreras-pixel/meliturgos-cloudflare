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
  assert.match(source, /: instructionPrompt\\n\\s*\\? \\(\\(\\) =>/);
  assert.match(source, /explicitCodeRead\\?\\.id === 'code.read'/);
});

test('an ordinary request mentioning « activité » is not routed to MEL\'s own activity log', async () => {
  const { inferNativeSelfActivityCapability } = await import('../src/api/native-chat.js');
  assert.equal(inferNativeSelfActivityCapability('Établis un plan d’action en 5 étapes numérotées pour lancer une petite activité de traduction en ligne.'), null);
  assert.deepEqual(inferNativeSelfActivityCapability('qu’as-tu fait aujourd’hui ?'), { id: 'autonomy.activity', input: { limit: 30 } });
  assert.deepEqual(inferNativeSelfActivityCapability('sur quoi avances-tu dans ton activité autonome ?'), { id: 'autonomy.activity', input: { limit: 30 } });
});

test('every chat turn states MEL\'s real tools, so she never describes herself as a bare text model', async () => {
  const { MEL_REAL_CAPABILITIES } = await import('../src/api/native-chat.js');
  for (const fact of ['recherche web', 'MEL Companion', 'MEL WORK est automatique', 'tâches planifiées', 'Ne dis donc jamais']) assert.ok(MEL_REAL_CAPABILITIES.includes(fact), fact);
  const source = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  assert.equal(source.match(/^\s+MEL_REAL_CAPABILITIES,$/gm)?.length, 2, 'in both the plain-chat and the tool-aware system prompts');
});

test('MEL WORK operational questions consult runtime instead of relying only on canned credentials lists', async () => {
  const source = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  const { MEL_REAL_CAPABILITIES } = await import('../src/api/native-chat.js');
  assert.match(source, /melWorkCapabilityQuestion/);
  assert.match(source, /!melWorkCapabilityQuestion/);
  assert.match(MEL_REAL_CAPABILITIES, /ne nécessitent pas de réclamer de nouveaux secrets/);
  assert.match(MEL_REAL_CAPABILITIES, /Ne demande jamais de copier un token/);
});
