import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createConversationService } from '../src/conversations/conversation-service.js';
import { auditOwnerCommunication } from '../src/capabilities/communication-audit-capability.js';

test('communication audit detects contradictions from archived exchanges', async () => {
  const DB = sqliteD1();
  try {
    const service = createConversationService({ DB });
    const conv = 'audit-c1';
    await service.archiveMessage({ conversationId:conv, role:'user', content:'Peux-tu inspecter ton dépôt et me dire si tu as accès à ton code MEL ?', timestamp:1000 });
    await service.archiveMessage({ conversationId:conv, role:'assistant', content:"Oui, j'ai accès à mon dépôt et à mon code MEL via mes outils.", timestamp:1001, capabilitiesUsed:['code.read'] });
    await service.archiveMessage({ conversationId:conv, role:'user', content:'Et maintenant, peux-tu toujours voir ton code et répondre sur ce sujet uniquement ?', timestamp:1100 });
    await service.archiveMessage({ conversationId:conv, role:'assistant', content:"Je n'ai pas accès au code. Parlons plutôt de cuisine méditerranéenne et de recettes.", timestamp:1101 });
    const out = await auditOwnerCommunication({ DB, MELITURGOS_USER:'owner' }, { conversationId:conv, maxMessages:500 });
    assert.equal(out.ok, true);
    assert.equal(out.scanned_conversations, 1);
    assert.ok(out.issue_counts.GLOBAL_INCAPACITY_CLAIM >= 1);
    assert.ok(out.issue_counts.POSSIBLE_SELF_CONTRADICTION >= 1);
  } finally { DB.close(); }
});
