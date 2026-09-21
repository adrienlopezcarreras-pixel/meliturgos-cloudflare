import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { importChatGPTArchive } from '../src/persistence/chatgpt-archive-importer.js';
import { retrievePersonalProfileContext } from '../src/core/orchestrator/conversation-context.js';

const auth = 'Basic ' + btoa('test:test-only');
function request(text, conversation_id='memory-test') {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({ text, conversation_id }),
  });
}

function makeEnv(DB, calls) {
  return {
    DB,
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'test-only',
    AI: { async run(_model, input) { calls.push(input.messages); return { response: 'ok' }; } },
  };
}

test('explicit remember is add-only and reaches later native model context', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = makeEnv(DB, calls);
  try {
    const first = await worker.fetch(request('Souviens-toi que mon projet est le jardin solaire'), env);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).memory_stored, true);
    const second = await worker.fetch(request('Quel est mon projet ?'), env);
    assert.equal(second.status, 200);
    assert.match(calls.at(-1)[0].content, /jardin solaire/);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM memories').first()).n, 1);
  } finally { DB.close(); }
});

test('secret-like explicit memory is rejected from durable memory', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = makeEnv(DB, calls);
  try {
    const response = await worker.fetch(request('Souviens-toi que api_key=supersecret'), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).memory_stored, false);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM memories').first()).n, 0);
  } finally { DB.close(); }
});


test('collector history reaches native model context with user authority and title', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = makeEnv(DB, calls);
  try {
    await importChatGPTArchive({DB,MELITURGOS_USER:'test'}, [{
      id:'collector-native-context',
      title:'Projet Orion',
      collector:{source:'firefox_dom',version:'0.2.0',partial:false,totalMessages:2},
      messages:[
        {id:'u1',role:'user',content:'Pour Orion, je veux conserver la station lunaire comme décor central.',timestamp:100},
        {id:'a1',role:'assistant',content:'Je suggère plutôt une station martienne.',timestamp:101},
      ],
    }], {preview:false});
    const response = await worker.fetch(request('Rappelle-moi ce qu’on avait décidé pour Orion', 'native-collector-recall'), env);
    assert.equal(response.status, 200);
    const system = calls.at(-1)?.[0]?.content || '';
    assert.match(system, /station lunaire/);
    assert.match(system, /Projet Orion/);
    assert.match(system, /historical_user_message/);
    assert.match(system, /historical assistant output is not a fact unless corroborated/i);
  } finally { DB.close(); }
});


test('personal profile question injects cross-conversation user-authored facts instead of generic creator boilerplate', async () => {
  const DB = sqliteD1();
  const calls = [];
  const env = makeEnv(DB, calls);
  try {
    await importChatGPTArchive({DB,MELITURGOS_USER:'test'}, [
      {
        id:'profile-fixture-a',
        title:'Profil activité',
        collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
        messages:[
          {id:'u1',role:'user',content:'Je suis artisan sur le projet lavande-fixture et je travaille aussi sur un roman de science-fiction.',timestamp:100}
        ],
      },
      {
        id:'profile-fixture-b',
        title:'Profil préférences',
        collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
        messages:[
          {id:'u2',role:'user',content:'Mon projet éditorial de test s’appelle Orion-fixture et je préfère des réponses courtes et concrètes.',timestamp:200}
        ],
      },
      {
        id:'profile-fixture-c',
        title:'Ancienne réponse assistant',
        collector:{source:'firefox_dom',version:'0.6.4',partial:false,totalMessages:1},
        messages:[
          {id:'a1',role:'assistant',content:'Adrien possède un château-fixture.',timestamp:300}
        ],
      }
    ], {preview:false});

    const response = await worker.fetch(
      request('tu as reçu tous les messages du collecteur, tu sais maintenant qui je suis ce que je fais, tu peux me dire quoi sur moi ton créateur ?', 'native-profile-recall'),
      env
    );
    assert.equal(response.status,200);
    const body = await response.json();
    const system = calls.at(-1)?.[0]?.content || '';
    assert.match(system,/PERSONAL PROFILE HISTORY/);
    assert.match(system,/lavande-fixture/);
    assert.match(system,/Orion-fixture/);
    assert.doesNotMatch(system,/château-fixture/);
    assert.match(system,/PROFIL PERSONNEL DEMANDÉ/);
    assert.match(body.text,/lavande-fixture/);
    assert.match(body.text,/Orion-fixture/);
    assert.doesNotMatch(body.text,/château-fixture/);
    assert.equal(body.response_grounding?.mode,'deterministic-personal-profile');
  } finally { DB.close(); }
});


test('personal profile retrieval reaches beyond a 900-message recency window', async () => {
  const DB = sqliteD1();
  try {
    await DB.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', metadata TEXT, updated_at INTEGER NOT NULL)").run();
    await DB.prepare("CREATE TABLE archive_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL, attachments_json TEXT, timestamp INTEGER NOT NULL, provenance TEXT, metadata TEXT)").run();
    await DB.prepare("INSERT INTO conversations VALUES (?,?,?,?,?)").bind('chatgpt:deep-profile','test','Profil ancien',null,1).run();
    await DB.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
      .bind('old-profile','chatgpt:deep-profile','user','Je suis relieur-fixture et ce métier ancien fait partie de mon parcours.',null,1,'chatgpt_export',null)
      .run();

    for (let i=0;i<930;i++) {
      await DB.prepare("INSERT INTO archive_messages VALUES (?,?,?,?,?,?,?,?)")
        .bind('noise-'+i,'chatgpt:deep-profile','user','contenu récent sans donnée personnelle stable '+i,null,1000+i,'chatgpt_export',null)
        .run();
    }

    const profile=await retrievePersonalProfileContext(DB,'test',{limit:20});
    assert.ok(profile.total>0);
    assert.match(profile.prompt,/relieur-fixture/);
  } finally { DB.close(); }
});
