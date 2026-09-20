import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferResponseMode,
  buildResponseQualityInstruction,
  finalizeEvidenceAlignedResponse,
} from '../src/api/response-quality.js';

test('short progress questions get compact status mode', () => {
  for(const text of ["c'est bon ?", 'fini ?', 'maj', 'avance', 'ça marche ?']){
    assert.equal(inferResponseMode(text),'compact_status',text);
  }
  assert.equal(inferResponseMode('explique-moi pourquoi cette réponse était incohérente'),'explanatory');
});

test('quality instruction forces answer-first evidence-oriented communication', () => {
  const prompt=buildResponseQualityInstruction("c'est bon ?");
  assert.match(prompt,/MODE COMPACT_STATUS/);
  assert.match(prompt,/première phrase/i);
  assert.match(prompt,/vérifié maintenant/i);
  assert.match(prompt,/ne dis jamais « c’est fait »/i);
  assert.match(prompt,/VERROU DE SUJET/);
  assert.match(prompt,/échanges récents de la même conversation/i);
});

test('code-access contradiction is repaired when runtime proves access', () => {
  const out=finalizeEvidenceAlignedResponse({
    text:"Je n'ai pas accès à mon code source.",
    userText:"tu as accès à ton code ?",
    codeAccess:{available:true},
    toolResults:[{capability:'code.integrity',status:'SUCCEEDED',result:{branch:'candidate/mel-clean-autonomy',head:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}}],
  });
  assert.match(out,/Oui, j’ai accès à mon dépôt\/code MEL/i);
  assert.match(out,/branche candidate\/mel-clean-autonomy/i);
  assert.doesNotMatch(out,/je n['’]ai pas accès/i);
});

test('queued development cannot be described as already completed', () => {
  const out=finalizeEvidenceAlignedResponse({
    text:"C'est fait et déployé en production.",
    userText:'améliore tes réponses',
    codeAccess:{available:true},
    developmentQueued:{job_id:'job-42',status:'RUNNING'},
  });
  assert.match(out,/job job-42/);
  assert.match(out,/statut RUNNING/);
  assert.match(out,/pas encore prouvé terminé ni déployé/i);
});

test('punctual tool failure is not converted into global incapacity', () => {
  const out=finalizeEvidenceAlignedResponse({
    text:"Je ne peux pas accéder à cela.",
    userText:'lis ce fichier',
    codeAccess:{available:true},
    toolResults:[{capability:'code.read',status:'FAILED',error:'UPSTREAM_TIMEOUT'}],
  });
  assert.match(out,/code\.read a échoué cette fois/i);
  assert.match(out,/UPSTREAM_TIMEOUT/);
  assert.match(out,/ne prouve pas une incapacité générale/i);
});

test('meta AI preambles are removed from otherwise useful answers', () => {
  const out=finalizeEvidenceAlignedResponse({
    text:"En tant qu'intelligence artificielle, je peux t'expliquer le mécanisme. Voici le point essentiel.",
    userText:'explique',
  });
  assert.doesNotMatch(out,/^En tant qu/i);
  assert.match(out,/Voici le point essentiel/);
});
