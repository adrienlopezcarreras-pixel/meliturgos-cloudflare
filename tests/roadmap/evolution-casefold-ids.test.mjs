import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {sqliteD1} from '../helpers/sqlite-d1.mjs';
import {migrate} from '../../src/persistence/migrations.js';
import {initializeEvolutionStorage, saveEvolutionProposal, listEvolutionItems, enforceEvolutionIdCaseIndex} from '../../src/roadmap/evolution-storage.js';
import {proposeEvolution,evolutionSnapshot} from '../../src/roadmap/evolution-inbox.js';
import {approvedEvolutionRoadmap} from '../../src/roadmap/evolution-autonomy-queue.js';

const proposal=(id,title)=>({id,title,origin:'mel'});
test('pure registry prevents casefold duplicate IDs before autonomy receives them',()=>{
 const a=proposeEvolution([],proposal('MEL-CASE','Feature one')).items;
 assert.throws(()=>proposeEvolution(a,proposal('mel-case','Different feature')),/EVOLUTION_DUPLICATE_ID/);
 assert.throws(()=>evolutionSnapshot({initial:{total:1,verified:1},items:[
  a[0],{...a[0],id:'mel-case',title:'Other feature'}
 ]}),/EVOLUTION_DUPLICATE_ID/);
 assert.throws(()=>approvedEvolutionRoadmap([
  {...a[0],status:'APPROVED'}, {...a[0],id:'mel-case',title:'Different feature',status:'APPROVED'}
 ]),/EVOLUTION_QUEUE_DUPLICATE_ID/);
});
test('casefold D1 index blocks same-owner collision, but not other owners',async()=>{
 const db=sqliteD1();
 try{
  await migrate(db);
  const first=await saveEvolutionProposal(db,'owner-A',proposal('MEL-CASE','First workflow'));
  assert.equal(first.created,true);
  await assert.rejects(saveEvolutionProposal(db,'owner-A',proposal('mel-case','Separate workflow')),/EVOLUTION_DUPLICATE_ID/);
  const second=await saveEvolutionProposal(db,'owner-B',proposal('mel-case','Separate workflow'));
  assert.equal(second.created,true);
  assert.equal((await listEvolutionItems(db,'owner-A')).length,1);
  assert.equal((await listEvolutionItems(db,'owner-B')).length,1);
  const indexes=(await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_mel_evolution_owner_id_nocase'").all()).results;
  assert.equal(indexes.length,1);
 }finally{db.close();}
});
test('concurrent same-owner ID case collisions fail atomically',async()=>{
 const db=sqliteD1();
 try{
  await initializeEvolutionStorage(db);
  const results=await Promise.allSettled([
   saveEvolutionProposal(db,'owner-ONE',proposal('RACE-1','Race action one')),
   saveEvolutionProposal(db,'owner-ONE',proposal('race-1','Race action two'))
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.equal((await listEvolutionItems(db,'owner-ONE')).length,1);
 }finally{db.close();}
});
test('legacy case collisions fail migration with explicit diagnostic',async()=>{
 const db=sqliteD1();
 try{
  const sql=await readFile(new URL('../../migrations/0018_evolution_development.sql',import.meta.url),'utf8');
  await db.prepare('CREATE TABLE mel_evolution_items(owner_scope TEXT NOT NULL,id TEXT NOT NULL,canonical_title TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(owner_scope,id),UNIQUE(owner_scope,canonical_title))').run();
  await db.prepare('INSERT INTO mel_evolution_items(owner_scope,id,canonical_title,payload) VALUES(?,?,?,?)').bind('owner','MEL-ID','title one','{}').run();
  await db.prepare('INSERT INTO mel_evolution_items(owner_scope,id,canonical_title,payload) VALUES(?,?,?,?)').bind('owner','mel-id','title two','{}').run();
  await assert.rejects(enforceEvolutionIdCaseIndex(db),/EVOLUTION_CASE_COLLISION_MIGRATION_REQUIRED/);
 }finally{db.close();}
});
test('Wrangler v19 index and runtime casefold index have the same identity',async()=>{
 const db=sqliteD1();
 const sql=await readFile(new URL('../../migrations/0019_evolution_owner_id_nocase.sql',import.meta.url),'utf8');
 try{
  await initializeEvolutionStorage(db);
  const before=await db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_mel_evolution_owner_id_nocase'").first();
  assert.match(before.sql,/owner_scope,lower\(id\)/);
  const raw=new DatabaseSync(':memory:');
  try{
   raw.exec('CREATE TABLE mel_evolution_items(owner_scope TEXT NOT NULL,id TEXT NOT NULL)');
   raw.exec(sql);
   const expected=raw.prepare("SELECT sql FROM sqlite_master WHERE name='idx_mel_evolution_owner_id_nocase'").get();
   assert.match(expected.sql,/owner_scope,lower\(id\)/);
  }finally{raw.close();}
 }finally{db.close();}
});
