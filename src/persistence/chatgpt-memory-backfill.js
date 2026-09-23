import { createSyncService } from '../conversations/sync-service.js';

const MAX_CONVERSATIONS_PER_BATCH = 50;
const MAX_MESSAGES_PER_CONVERSATION_BATCH = 1000;
const MAX_LOOPS_PER_CONVERSATION = 20;

function n(value){const out=Number(value);return Number.isFinite(out)?Math.max(0,Math.trunc(out)):0;}

async function scalar(db,sql,...bindings){
  const row=await db.prepare(sql).bind(...bindings).first();
  return n(row?.count);
}

export async function getChatGPTMemoryBackfillStatus(env){
  if(!env?.DB) return {
    ok:false,
    code:'CHATGPT_MEMORY_BACKFILL_DB_REQUIRED',
    status:'UNAVAILABLE',
    total_messages:0,
    eligible_messages:0,
    ineligible_messages:0,
    synced_eligible_messages:0,
    remaining_eligible_messages:0,
    remaining_conversations:0,
    complete:false,
  };

  const sync=createSyncService(env);
  await sync.migrate();

  const [total,eligible,synced,remainingConversations]=await Promise.all([
    scalar(env.DB,"SELECT COUNT(*) AS count FROM archive_messages WHERE provenance='chatgpt_export'"),
    scalar(env.DB,`SELECT COUNT(*) AS count FROM archive_messages
      WHERE provenance='chatgpt_export'
        AND trim(COALESCE(content,''))<>''
        AND lower(COALESCE(role,'')) IN ('user','assistant','system','tool')`),
    scalar(env.DB,`SELECT COUNT(*) AS count
      FROM archive_messages a
      WHERE a.provenance='chatgpt_export'
        AND trim(COALESCE(a.content,''))<>''
        AND lower(COALESCE(a.role,'')) IN ('user','assistant','system','tool')
        AND EXISTS (
          SELECT 1 FROM memory_candidates c
          WHERE c.conversation_id=a.conversation_id AND c.message_id=a.id
        )`),
    scalar(env.DB,`SELECT COUNT(DISTINCT a.conversation_id) AS count
      FROM archive_messages a
      WHERE a.provenance='chatgpt_export'
        AND trim(COALESCE(a.content,''))<>''
        AND lower(COALESCE(a.role,'')) IN ('user','assistant','system','tool')
        AND NOT EXISTS (
          SELECT 1 FROM memory_candidates c
          WHERE c.conversation_id=a.conversation_id AND c.message_id=a.id
        )`)
  ]);
  const remaining=Math.max(0,eligible-synced);
  return {
    ok:true,
    status:remaining===0?'COMPLETE':'PENDING',
    total_messages:total,
    eligible_messages:eligible,
    ineligible_messages:Math.max(0,total-eligible),
    synced_eligible_messages:synced,
    remaining_eligible_messages:remaining,
    remaining_conversations:remainingConversations,
    complete:remaining===0,
  };
}

export async function backfillChatGPTArchiveToMemory(env,{conversationLimit=MAX_CONVERSATIONS_PER_BATCH}={}){
  if(!env?.DB){
    const error=new Error('CHATGPT_MEMORY_BACKFILL_DB_REQUIRED');
    error.code='CHATGPT_MEMORY_BACKFILL_DB_REQUIRED';
    error.status=503;
    throw error;
  }
  const limit=Number(conversationLimit);
  if(!Number.isInteger(limit)||limit<1||limit>MAX_CONVERSATIONS_PER_BATCH){
    const error=new Error('CHATGPT_MEMORY_BACKFILL_LIMIT_INVALID');
    error.code='CHATGPT_MEMORY_BACKFILL_LIMIT_INVALID';
    error.status=400;
    throw error;
  }

  const sync=createSyncService(env);
  await sync.migrate();
  const rows=await env.DB.prepare(`SELECT DISTINCT a.conversation_id
    FROM archive_messages a
    WHERE a.provenance='chatgpt_export'
      AND trim(COALESCE(a.content,''))<>''
      AND lower(COALESCE(a.role,'')) IN ('user','assistant','system','tool')
      AND NOT EXISTS (
        SELECT 1 FROM memory_candidates c
        WHERE c.conversation_id=a.conversation_id AND c.message_id=a.id
      )
    ORDER BY a.conversation_id ASC
    LIMIT ?`).bind(limit).all();

  const conversationIds=(rows?.results||[]).map(row=>String(row.conversation_id||'').trim()).filter(Boolean);
  const totals={scanned:0,eligible:0,inserted:0,alreadyPresent:0,skippedEmpty:0,conversations_processed:0};
  for(const conversationId of conversationIds){
    let loops=0;
    while(loops<MAX_LOOPS_PER_CONVERSATION){
      loops+=1;
      const result=await sync.syncToMemory({
        conversationId,
        limit:MAX_MESSAGES_PER_CONVERSATION_BATCH,
      });
      totals.scanned+=n(result.scanned);
      totals.eligible+=n(result.eligible);
      totals.inserted+=n(result.inserted);
      totals.alreadyPresent+=n(result.alreadyPresent);
      totals.skippedEmpty+=n(result.skippedEmpty);
      if(n(result.scanned)<MAX_MESSAGES_PER_CONVERSATION_BATCH) break;
    }
    if(loops>=MAX_LOOPS_PER_CONVERSATION){
      const remaining=await scalar(env.DB,`SELECT COUNT(*) AS count FROM archive_messages a
        WHERE a.conversation_id=?
          AND a.provenance='chatgpt_export'
          AND trim(COALESCE(a.content,''))<>''
          AND lower(COALESCE(a.role,'')) IN ('user','assistant','system','tool')
          AND NOT EXISTS (
            SELECT 1 FROM memory_candidates c
            WHERE c.conversation_id=a.conversation_id AND c.message_id=a.id
          )`,conversationId);
      if(remaining>0){
        const error=new Error('CHATGPT_MEMORY_BACKFILL_CONVERSATION_LOOP_LIMIT');
        error.code='CHATGPT_MEMORY_BACKFILL_CONVERSATION_LOOP_LIMIT';
        error.status=409;
        error.conversation_id=conversationId;
        error.remaining=remaining;
        throw error;
      }
    }
    totals.conversations_processed+=1;
  }

  const status=await getChatGPTMemoryBackfillStatus(env);
  return {
    ...status,
    batch:{
      ...totals,
      requested_conversation_limit:limit,
      replay_safe:totals.inserted===0,
    },
  };
}

export const CHATGPT_MEMORY_BACKFILL_LIMITS=Object.freeze({
  max_conversations_per_batch:MAX_CONVERSATIONS_PER_BATCH,
  max_messages_per_conversation_batch:MAX_MESSAGES_PER_CONVERSATION_BATCH,
  max_loops_per_conversation:MAX_LOOPS_PER_CONVERSATION,
});
