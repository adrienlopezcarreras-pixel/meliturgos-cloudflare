import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVerifiedSelfStateResponse } from '../src/api/response-grounding.js';

test('verified self-state response states evidence and preserves observation boundaries', () => {
  const text = formatVerifiedSelfStateResponse({
    observed_at: '2026-09-20T10:00:00.000Z',
    sections: {
      code: { ok:true, data:{ status:'PASS', branch:'candidate/mel-clean-autonomy', head:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', self_code:{ exact_identity_known:true, branch:'release/test', commit:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } } },
      work: { ok:true, data:{ count:2, work:[{status:'RUNNING'},{status:'WAITING'}] } },
      recent_work: { ok:true, data:{ work:[{job_id:'job-1',status:'RUNNING'}] } },
      memory: { ok:true, data:{ status:'ONLINE', memory_count:10, archive_count:200, conversation_count:20 } },
      chatgpt_import: { ok:true, data:{ conversations:15, messages:180, memory_sync_complete:true, full_archive_confirmed:false } },
      autonomy: { ok:true, data:{ status:'BUILDING_AUTONOMY', jobs:{ current:null }, control:{paused:false} } },
      system: { ok:true, data:{ ai:true, db:true, github_repository:'owner/repo', github_branch:'candidate/mel-clean-autonomy' } },
    },
    capabilities: { registered:60, enabled:59, health:{HEALTHY:58,DEGRADED:2} },
  }, "est-ce que tu vois les changements et toutes les mémoires récupérées de ChatGPT ?");

  assert.match(text, /HEAD aaaaaaaa/);
  assert.match(text, /10 mémoire\(s\)/);
  assert.match(text, /15 conversation\(s\), 180 message\(s\)/);
  assert.match(text, /ne vois pas ce qui reste uniquement dans un autre onglet/i);
  assert.match(text, /ne charge pas toute l’archive dans chaque réponse/i);
  assert.doesNotMatch(text, /je n['’]ai pas accès/i);
});

test('self-state formatter reports a local observation failure without claiming global incapacity', () => {
  const text = formatVerifiedSelfStateResponse({
    sections: {
      code: { ok:false, error:'CODE_HEAD_READ_FAILED' },
      memory: { ok:true, data:{ status:'ONLINE', memory_count:4, archive_count:5, conversation_count:2 } },
      chatgpt_import: { ok:false, error:'IMPORT_STATUS_FAILED' },
    },
    capabilities: { registered:12, enabled:12, health:{HEALTHY:12} },
  }, 'quel est ton état réel ?');

  assert.match(text, /Code indisponible pour cette vérification \(CODE_HEAD_READ_FAILED\)/);
  assert.match(text, /Mémoire persistante : ONLINE/);
  assert.doesNotMatch(text, /je n['’]ai accès à rien/i);
});
