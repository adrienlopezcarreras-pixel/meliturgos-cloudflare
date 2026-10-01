import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import {
  handleNativeChat,
  shouldEscalateNativeChatToCouncil,
} from '../src/api/native-chat.js';

function request(text, conversationId='council-recovery'){
  return new Request('https://mel.test/api/chat',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({text,conversation_id:conversationId}),
  });
}

test('Council recovery triggers on admitted inability and failed tools but not on a healthy answer',()=>{
  assert.equal(shouldEscalateNativeChatToCouncil({
    userText:'fais cette tâche',
    responseText:'Je ne sais pas comment faire.',
    assessment:{issues:[]},
    toolResults:[],
  }),true);
  assert.equal(shouldEscalateNativeChatToCouncil({
    userText:'fais cette tâche',
    responseText:'La tâche a échoué avec son code exact.',
    assessment:{issues:[]},
    toolResults:[{capability:'x',status:'FAILED',error:'X_FAILED'}],
  }),true);
  assert.equal(shouldEscalateNativeChatToCouncil({
    userText:'explique ce point',
    responseText:'Voici une explication claire et utile du point demandé.',
    assessment:{issues:[]},
    toolResults:[],
  }),false);
  assert.equal(shouldEscalateNativeChatToCouncil({
    userText:'reste hors de ce sujet',
    responseText:'réponse',
    assessment:{issues:[{code:'EXCLUDED_SCOPE_ACTION',severity:'high'}]},
    toolResults:[],
  }),false);
});

test('successful Council recovery persists reusable runtime XP and a learned correction',async()=>{
  const DB=sqliteD1();
  const previous=process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS='1';
  const calls=[];
  const env={
    DB,
    MELITURGOS_USER:'owner',
    AI:{
      async run(model,payload){
        const joined=(payload?.messages||[]).map(row=>String(row?.content||'')).join('\n');
        calls.push({model,joined});
        if(joined.includes('RÉCUPÉRATION COUNCIL')){
          return {response:'Pour réparer ce test précis, commence par lire son erreur exacte, vérifie le contrat concerné, puis applique une correction bornée et relance le test.'};
        }
        if(joined.includes('Tu es MEL, coordinatrice du Model Council.')){
          return {response:'Le Council recommande de partir de l erreur exacte, de choisir la capacité réellement disponible et de ne jamais prétendre que la tâche est faite sans preuve.'};
        }
        if(joined.includes('MISSION DE RÉCUPÉRATION MEL.')){
          return {response:'Analyse indépendante : diagnostiquer l erreur exacte puis proposer une action prouvable.'};
        }
        return {response:'Je ne sais pas comment répondre à cette demande.'};
      },
    },
  };
  try{
    const response=await handleNativeChat(request('Explique comment réparer ce test précis'),env,{authorized:true});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.ok,true);
    assert.equal(body.council_recovery.attempted,true);
    assert.equal(body.council_recovery.succeeded,true);
    assert.equal(body.council_recovery.accepted,true);
    assert.equal(body.council_recovery.experience_saved,true);
    assert.equal(body.council_recovery.correction_saved,true);
    assert.equal(body.council_recovery.xp_gain,1);
    assert.match(body.text,/réparer ce test précis/i);
    assert.ok(calls.some(row=>row.joined.includes('MISSION DE RÉCUPÉRATION MEL.')));
    assert.ok(calls.some(row=>row.joined.includes('RÉCUPÉRATION COUNCIL')));

    const rows=await DB.prepare("SELECT kind,outcome,tags_json FROM mentor_lessons WHERE kind IN ('EXPERIENCE','TEACHER_CORRECTION')").all();
    const kinds=(rows.results||[]).map(row=>row.kind);
    assert.ok(kinds.includes('EXPERIENCE'));
    assert.ok(kinds.includes('TEACHER_CORRECTION'));
  }finally{
    if(previous==null) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS=previous;
    DB.close();
  }
});
