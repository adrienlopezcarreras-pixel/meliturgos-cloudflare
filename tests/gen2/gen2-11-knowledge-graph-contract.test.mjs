import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeGraph, validateEntity, validateRelation } from '../../src/memory/knowledge-graph.js';

test('GEN2-11 knowledge graph contract supports sourced entities, relations, queries and supersession', async () => {
  const entities = new Map();
  const relations = [];
  const superseded = new Map();

  const graph = createKnowledgeGraph({
    async entity(record) {
      const checked = validateEntity(record);
      entities.set(checked.id, structuredClone(checked));
      return structuredClone(checked);
    },
    async relation(record) {
      const checked = validateRelation(record);
      relations.push(structuredClone(checked));
      return structuredClone(checked);
    },
    async query({ entityId }) {
      return {
        entity: structuredClone(entities.get(entityId) || null),
        relations: relations.filter(r => r.subject === entityId || r.object === entityId).map(structuredClone),
        superseded_by: superseded.get(entityId) || null,
      };
    },
    async supersede({ id, replacementId }) {
      assert.ok(entities.has(id));
      assert.ok(entities.has(replacementId));
      superseded.set(id, replacementId);
      return { id, replacementId };
    },
  });

  await graph.entity({
    id:'project-atlas', type:'PROJECT', name:'Atlas',
    source:'archive:conv-1/msg-10', confidence:0.97,
  });
  await graph.entity({
    id:'decision-atlas-local-v1', type:'DECISION', name:'Conserver moteur local',
    source:'archive:conv-2/msg-20', confidence:0.94,
  });
  await graph.entity({
    id:'decision-atlas-local-v2', type:'DECISION', name:'Conserver moteur local avec provenance',
    source:'archive:conv-3/msg-30', confidence:0.99,
  });

  await graph.relation({
    subject:'project-atlas', relation:'HAS_DECISION', object:'decision-atlas-local-v1',
    source:'archive:conv-2/msg-20', confidence:0.94,
  });

  const before = await graph.query({ entityId:'project-atlas' });
  assert.equal(before.entity.type, 'PROJECT');
  assert.equal(before.entity.source, 'archive:conv-1/msg-10');
  assert.equal(before.relations.length, 1);
  assert.equal(before.relations[0].object, 'decision-atlas-local-v1');
  assert.equal(before.relations[0].source, 'archive:conv-2/msg-20');

  await graph.supersede({ id:'decision-atlas-local-v1', replacementId:'decision-atlas-local-v2' });
  const oldDecision = await graph.query({ entityId:'decision-atlas-local-v1' });
  assert.equal(oldDecision.superseded_by, 'decision-atlas-local-v2');

  assert.throws(() => validateEntity({ id:'bad', type:'UNKNOWN', name:'x', source:'s', confidence:1 }));
  assert.throws(() => validateRelation({ subject:'a', relation:'R', object:'b', source:'', confidence:0.5 }));
});
