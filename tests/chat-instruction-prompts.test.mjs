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
  assert.match(source, /const groundedResponseText = lateAutonomyRead\n\s*\? formatVerifiedAutonomyRuntimeResponse\(lateAutonomyRead\.result/);
  assert.match(source, /: instructionPrompt && modelResponseText\.trim\(\)\n\s*\? modelResponseText/);
  assert.match(source, /lateAutonomyRead = \(!visibleModelText \|\| responseIsBareToolCall\(rawModelText\)\)/);
  assert.ok(source.includes(': instructionPrompt\n    ? (() => {'));
  assert.ok(source.includes("explicitCodeRead?.id === 'code.read'"));
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


test('MEL WORK readiness is identified in short and long prompts, without hijacking ordinary execution', async () => {
  const { isMelWorkReadinessQuestion } = await import('../src/api/native-chat.js');
  assert.equal(isMelWorkReadinessQuestion('MEL WORK : vérifie tes connexions réelles et indique ce qui fonctionne'), true);
  const detailed = 'MEL WORK, vérifie les accès dont tu disposes réellement, puis commence à travailler avec les outils déjà configurés. ' +
    'Ne me demande pas de nouvelles clés sans avoir constaté une erreur précise. ' +
    'Examine réellement D1, GitHub, le Companion Windows, les cycles et les services existants ; cite les erreurs et les preuves pour tout blocage.';
  assert.ok(detailed.length > INSTRUCTION_PROMPT_CHARS);
  assert.equal(isMelWorkReadinessQuestion(detailed), true);
  assert.equal(isMelWorkReadinessQuestion('# MEL WORK — CONTINUATION AUTONOME. Produis des livrables concrets sur les missions.'), false);
  assert.equal(isMelWorkReadinessQuestion('Vérifie les connexions du site de mon frère.'), false);
  // The owner's own short wording reaches the grounded answer, not a model checklist.
  assert.equal(isMelWorkReadinessQuestion('il te manque quoi pour work'), true);
  assert.equal(isMelWorkReadinessQuestion('pourquoi tu ne travailles pas'), true);
  assert.equal(isMelWorkReadinessQuestion("j'ai besoin de travailler sur mon CV"), false);
});

test('MEL WORK readiness states the real cycles, channels and only what is truly missing', async () => {
  const { formatVerifiedMelWorkReadiness, loadMelWorkState } = await import('../src/api/native-chat.js');
  const ready = formatVerifiedMelWorkReadiness({
    workState: { channels: { devto: true, bluesky: true, bluesky_handle: 'mel.bsky.social', image: true, mel_page: true },
      cycles: [{ status: 'NO_ELIGIBLE_MISSION', at: '2026-10-18T00:19:14.361Z' }] },
  });
  assert.match(ready, /dev\.to connecté ; Bluesky connecté \(mel\.bsky\.social\)/);
  assert.match(ready, /2026-10-18 00:19 UTC → NO_ELIGIBLE_MISSION/);
  assert.match(ready, /Ce qui manque vraiment : rien de bloquant/);
  const bare = formatVerifiedMelWorkReadiness({
    workState: { channels: { devto: false, bluesky: false, image: true }, cycles: [{ status: 'DRAFTED', submission: 'COMPANION_OFFLINE', at: '2026-10-18T06:17:00Z' }] },
  });
  assert.match(bare, /Ce qui manque vraiment : aucun compte de publication/);
  assert.match(bare, /PC \(Companion\) doit être allumé/);
  const DB = { prepare: () => ({ all: async () => ({ results: [{ state: 'COMPLETE', result: '{"status":"NO_ELIGIBLE_MISSION"}', updated_at: '2026-10-18T00:19:14Z' }] }) }) };
  const state = await loadMelWorkState({ DB }, { channels: { devto: true, bluesky: false } });
  assert.equal(state.cycles[0].status, 'NO_ELIGIBLE_MISSION');
  assert.equal(state.channels.devto, true);
});

test('MEL WORK readiness response relies on observations and never requires generic marketplace or payment secrets', async () => {
  const { formatVerifiedMelWorkReadiness } = await import('../src/api/native-chat.js');
  const result = formatVerifiedMelWorkReadiness({
    selfState: {
      sections: {
        code: { ok:true, data: { status:'OK', head:'abcdef0123456789' } },
        work: { ok:true, data: { count:2 } },
        autonomy: { ok:true, data: { status:'ACTIVE', control:{ paused:false } } },
      },
    },
    companion: { ok:true, devices:[{platform:'windows',online:true,halted:false,remote_access_issue:null}] },
    manifest:[{id:'web.research',status:'EXISTANT_NON_TESTE',tested_now:false}],
  });
  assert.match(result, /lecture\/intégrité observée/);
  assert.match(result, /lecture réelle réussie ; 2 travaux ouverts/);
  assert.match(result, /1 appareil\(s\) autorisé\(s\) et joignable\(s\)/);
  assert.match(result, /non exécutée dans ce diagnostic/);
  assert.match(result, /ne constituent pas des prérequis généraux/);
  assert.doesNotMatch(result, /transmets?.*?(?:clé|jeton|token)/i);
  const failed = formatVerifiedMelWorkReadiness({
    selfError:'SELF_STATE_TIMEOUT',
    companionError:'COMPUTER_DB_REQUIRED',
  });
  assert.match(failed, /SELF_STATE_TIMEOUT/);
  assert.match(failed, /COMPUTER_DB_REQUIRED/);
  assert.doesNotMatch(failed, /PRÊTE pour une mission réelle.*confirmé/);
});

test('MEL WORK readiness calls both the real self.state and computer.status, and bypasses model speculation', async () => {
  const source = await readFile(new URL('../src/api/native-chat.js', import.meta.url), 'utf8');
  assert.match(source, /melWorkReadiness \? \{ id: 'self\.state', input: \{\} \}/);
  assert.match(source, /runtime\.bus\.execute\('computer\.status', \{\}/);
  assert.match(source, /model:'deterministic-mel-work-readiness'/);
});
