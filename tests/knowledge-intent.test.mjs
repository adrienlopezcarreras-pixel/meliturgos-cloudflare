import test from 'node:test';
import assert from 'node:assert/strict';
import { inferKnowledgeCapability } from '../src/api/knowledge-intent.js';

test('compound research request routes to research + verification + durable memory',()=>{
  const out=inferKnowledgeCapability("cherche sur internet l'histoire de Guadix, vérifie avec plusieurs sources, crée un dossier, classe les informations et mémorise-les");
  assert.equal(out.id,'knowledge.research');
  assert.equal(out.input.depth,3);
  assert.equal(out.input.save_file,true);
  assert.equal(out.input.remember,true);
  assert.match(out.input.query,/histoire de Guadix/i);
  assert.doesNotMatch(out.input.query,/crée un dossier/i);
});

test('stored knowledge requests route to knowledge.search',()=>{
  const out=inferKnowledgeCapability('retrouve dans tes dossiers ce que tu as trouvé sur architecture agentique');
  assert.equal(out.id,'knowledge.search');
  assert.match(out.input.query,/architecture agentique/i);
});

test('explicit file creation with content creates a durable knowledge file',()=>{
  const out=inferKnowledgeCapability('crée un fichier nommé synthese.md contenant Bonjour MEL');
  assert.equal(out.id,'knowledge.file.create');
  assert.equal(out.input.filename,'synthese.md');
  assert.equal(out.input.content,'Bonjour MEL');
});

test('explicit durable file read is recognized',()=>{
  assert.deepEqual(inferKnowledgeCapability('lis le fichier synthese.md'),{id:'knowledge.file.read',input:{filename:'synthese.md'}});
});


test('knowledge intent does not steal repository-code searches unless web research is explicit',()=>{
  assert.equal(inferKnowledgeCapability('cherche dans ton code la fonction buildContext'),null);
  const web=inferKnowledgeCapability('cherche sur internet des sources récentes sur les agents IA');
  assert.equal(web.id,'knowledge.research');
});
