import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import {
  assessResponseQuality,
  enforceResponseQuality,
  persistResponseQualityEvent,
} from '../src/api/response-quality-audit.js';

test('quality audit catches a clearly off-topic answer and blocks it from being sent unchanged', () => {
  const focus = {
    anchor:'améliore la cohérence des réponses de MEL et sa connaissance de ses capacités',
    excluded_topics:['shardvault'],
    needs_clarification:false,
  };
  const assessment = assessResponseQuality({
    userText:'continue',
    responseText:'Les abeilles produisent du miel et vivent dans une ruche organisée autour de la reine.',
    focus,
    codeAccess:{available:true},
  });
  assert.ok(assessment.issues.some(row => row.code === 'POSSIBLE_OFF_TOPIC'));
  const guarded = enforceResponseQuality({
    responseText:'Les abeilles produisent du miel et vivent dans une ruche.',
    userText:'continue',
    focus,
    assessment,
  });
  assert.match(guarded, /reste uniquement sur ce périmètre/i);
  assert.doesNotMatch(guarded, /abeilles produisent/i);
});

test('quality audit catches action on an explicitly excluded topic', () => {
  const assessment = assessResponseQuality({
    userText:'avance',
    responseText:"Je travaille sur ShardVault et j'ai corrigé sa reconstruction.",
    focus:{
      anchor:'améliore la communication de MEL',
      excluded_topics:['shardvault'],
      needs_clarification:false,
    },
  });
  assert.ok(assessment.issues.some(row => row.code === 'EXCLUDED_SCOPE_ACTION'));
});

test('quality audit catches code-access contradiction against runtime truth', () => {
  const assessment = assessResponseQuality({
    userText:'tu as accès à ton code ?',
    responseText:"Je n'ai pas accès à mon code.",
    focus:{anchor:'tu as accès à ton code ?',excluded_topics:[]},
    codeAccess:{available:true},
  });
  assert.ok(assessment.issues.some(row => row.code === 'CODE_ACCESS_CONTRADICTION'));
});

test('quality events are persisted only when there are detected issues', async () => {
  const DB = sqliteD1();
  try {
    const env={DB};
    const assessment={
      ok:false,
      issues:[{code:'POSSIBLE_OFF_TOPIC',severity:'high'}],
      relevance:{ratio:0,anchor_tokens:4,shared_tokens:0},
    };
    assert.equal(await persistResponseQualityEvent(env,{
      conversationId:'quality-c1',
      userText:'continue',
      responseText:'hors sujet',
      focus:{anchor:'communication MEL'},
      assessment,
    }), true);
    const row=await DB.prepare('SELECT * FROM mel_response_quality_events WHERE conversation_id=?').bind('quality-c1').first();
    assert.ok(row);
    assert.match(row.issues_json,/POSSIBLE_OFF_TOPIC/);
    assert.equal(await persistResponseQualityEvent(env,{
      conversationId:'quality-c1',
      assessment:{ok:true,issues:[],relevance:{}},
    }), false);
  } finally {
    DB.close();
  }
});


test('topic-family match avoids blocking a relevant paraphrase with different words', () => {
  const assessment=assessResponseQuality({
    userText:'continue',
    responseText:'J’ai renforcé le contexte récent, le périmètre actif et la mémoire conversationnelle pour éviter les dérives.',
    focus:{
      anchor:'améliore la cohérence des réponses de MEL et sa connaissance de ses capacités',
      excluded_topics:[],
      needs_clarification:false,
    },
  });
  assert.equal(assessment.issues.some(row => row.code === 'POSSIBLE_OFF_TOPIC'), false);
});
