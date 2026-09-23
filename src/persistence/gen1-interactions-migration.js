import { migrate } from "./migrations.js";

const LEGACY_TABLE = "interactions";
const LEGACY_CONVERSATION_ID = "legacy-gen1";
const LEGACY_PROVENANCE = "legacy_gen1";
const REQUIRED_COLUMNS = Object.freeze([
  "id","created_at","user_text","assistant_text","model","feedback","correction"
]);
const MAX_BATCH = 500;

function boundedInt(value,{min=0,max=Number.MAX_SAFE_INTEGER,fallback=0}={}){
  const n=Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min,Math.min(max,Math.trunc(n)));
}

function parseMetadata(value){
  try{return value?JSON.parse(value):{};}catch{return {};}
}

async function tableExists(db){
  const row=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
    .bind(LEGACY_TABLE).first();
  return Boolean(row?.name);
}

async function legacyColumns(db){
  if(!(await tableExists(db))) return [];
  const rows=await db.prepare("PRAGMA table_info(interactions)").all();
  return (rows.results||[]).map(row=>String(row.name||"")).filter(Boolean);
}

function schemaReport(columns){
  const set=new Set(columns);
  const missing=REQUIRED_COLUMNS.filter(name=>!set.has(name));
  return {supported:missing.length===0,columns,missing_columns:missing};
}

function idsFor(interactionId){
  const id=String(interactionId);
  return {
    user:`legacy-gen1:${id}:user`,
    assistant:`legacy-gen1:${id}:assistant`,
  };
}

function metadataFor(row,part){
  return {
    legacy_source:LEGACY_TABLE,
    legacy_interaction_id:Number(row.id),
    legacy_part:part,
    legacy_created_at:Number(row.created_at),
    legacy_feedback:row.feedback==null?null:Number(row.feedback),
    legacy_correction:row.correction==null?null:String(row.correction),
    migrated_without_source_mutation:true,
  };
}

async function legacyConversationCollision(db){
  const row=await db.prepare("SELECT metadata FROM conversations WHERE id=? LIMIT 1")
    .bind(LEGACY_CONVERSATION_ID).first();
  if(!row) return false;
  const metadata=parseMetadata(row.metadata);
  return metadata?.source_table!==LEGACY_TABLE || metadata?.migration!=="GEN2-57";
}

async function legacyIntegrity(db){
  const mismatchPredicate=`
    u.id IS NULL
    OR a.id IS NULL
    OR u.conversation_id <> '${LEGACY_CONVERSATION_ID}'
    OR a.conversation_id <> '${LEGACY_CONVERSATION_ID}'
    OR u.role <> 'user'
    OR a.role <> 'assistant'
    OR u.content <> i.user_text
    OR a.content <> i.assistant_text
    OR COALESCE(a.model,'') <> COALESCE(i.model,'')
    OR u.timestamp <> i.created_at
    OR a.timestamp <> i.created_at + 1
    OR u.provenance <> '${LEGACY_PROVENANCE}'
    OR a.provenance <> '${LEGACY_PROVENANCE}'
    OR json_valid(u.metadata)=0
    OR json_valid(a.metadata)=0
    OR json_extract(u.metadata,'$.legacy_interaction_id') IS NOT i.id
    OR json_extract(a.metadata,'$.legacy_interaction_id') IS NOT i.id
    OR json_extract(a.metadata,'$.legacy_feedback') IS NOT i.feedback
    OR json_extract(a.metadata,'$.legacy_correction') IS NOT i.correction
  `;
  const row=await db.prepare(`SELECT
      SUM(CASE WHEN ${mismatchPredicate} THEN 1 ELSE 0 END) AS coverage_mismatches,
      SUM(CASE WHEN
        (u.id IS NOT NULL AND (
          u.conversation_id <> '${LEGACY_CONVERSATION_ID}'
          OR u.role <> 'user'
          OR u.content <> i.user_text
          OR u.timestamp <> i.created_at
          OR u.provenance <> '${LEGACY_PROVENANCE}'
          OR json_valid(u.metadata)=0
          OR json_extract(u.metadata,'$.legacy_interaction_id') IS NOT i.id
        ))
        OR
        (a.id IS NOT NULL AND (
          a.conversation_id <> '${LEGACY_CONVERSATION_ID}'
          OR a.role <> 'assistant'
          OR a.content <> i.assistant_text
          OR COALESCE(a.model,'') <> COALESCE(i.model,'')
          OR a.timestamp <> i.created_at + 1
          OR a.provenance <> '${LEGACY_PROVENANCE}'
          OR json_valid(a.metadata)=0
          OR json_extract(a.metadata,'$.legacy_interaction_id') IS NOT i.id
          OR json_extract(a.metadata,'$.legacy_feedback') IS NOT i.feedback
          OR json_extract(a.metadata,'$.legacy_correction') IS NOT i.correction
        ))
        THEN 1 ELSE 0 END) AS existing_mismatches
    FROM interactions i
    LEFT JOIN archive_messages u ON u.id=('legacy-gen1:' || i.id || ':user')
    LEFT JOIN archive_messages a ON a.id=('legacy-gen1:' || i.id || ':assistant')`).first();
  return {
    coverage_mismatches:boundedInt(row?.coverage_mismatches),
    existing_mismatches:boundedInt(row?.existing_mismatches),
  };
}

async function ensureLegacyConversation(db,owner=""){
  if(await legacyConversationCollision(db)){
    const error=new Error("GEN1_CONVERSATION_ID_COLLISION");
    error.code="GEN1_CONVERSATION_ID_COLLISION";
    error.status=409;
    throw error;
  }
  const first=await db.prepare("SELECT MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM interactions").first();
  const now=Date.now();
  const created=boundedInt(first?.first_at,{fallback:now});
  const updated=boundedInt(first?.last_at,{fallback:created});
  await db.prepare(`INSERT INTO conversations(id,owner,title,status,created_at,updated_at,metadata)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      owner=CASE WHEN conversations.owner='' THEN excluded.owner ELSE conversations.owner END,
      updated_at=MAX(conversations.updated_at,excluded.updated_at),
      metadata=excluded.metadata`)
    .bind(
      LEGACY_CONVERSATION_ID,
      String(owner||""),
      "Historique MEL Gen1",
      "archived",
      created,
      updated,
      JSON.stringify({source_table:LEGACY_TABLE,source_preserved:true,migration:"GEN2-57"})
    ).run();
}

async function archiveCount(db){
  const row=await db.prepare(`SELECT
      COUNT(*) AS messages,
      COUNT(DISTINCT json_extract(metadata,'$.legacy_interaction_id')) AS interactions
    FROM archive_messages
    WHERE provenance=? AND id LIKE 'legacy-gen1:%'`)
    .bind(LEGACY_PROVENANCE).first();
  return {
    messages:boundedInt(row?.messages),
    interactions:boundedInt(row?.interactions),
  };
}

export async function getLegacyInteractionMigrationStatus(env){
  if(!env?.DB) return {
    ok:false,
    available:false,
    code:"GEN1_MIGRATION_DB_REQUIRED",
    source_table:LEGACY_TABLE,
  };
  await migrate(env.DB);
  const exists=await tableExists(env.DB);
  if(!exists){
    return {
      ok:true,
      available:true,
      source_table:LEGACY_TABLE,
      source_present:false,
      source_preserved:true,
      schema:{supported:true,columns:[],missing_columns:[]},
      source_rows:0,
      expected_archive_messages:0,
      archived_messages:0,
      migrated_interactions:0,
      remaining_interactions:0,
      coverage_complete:true,
      status:"NOTHING_TO_MIGRATE",
    };
  }

  const columns=await legacyColumns(env.DB);
  const schema=schemaReport(columns);
  const source=await env.DB.prepare("SELECT COUNT(*) AS count, MAX(id) AS max_id FROM interactions").first();
  const sourceRows=boundedInt(source?.count);
  const archived=await archiveCount(env.DB);
  const conversationCollision=await legacyConversationCollision(env.DB);
  const integrity=schema.supported
    ? await legacyIntegrity(env.DB)
    : {coverage_mismatches:sourceRows,existing_mismatches:0};
  const migrated=Math.max(0,sourceRows-integrity.coverage_mismatches);
  const coverageComplete=schema.supported
    && !conversationCollision
    && integrity.existing_mismatches===0
    && integrity.coverage_mismatches===0
    && archived.messages===sourceRows*2;
  return {
    ok:true,
    available:true,
    source_table:LEGACY_TABLE,
    source_present:true,
    source_preserved:true,
    schema,
    source_rows:sourceRows,
    source_max_id:source?.max_id==null?null:boundedInt(source.max_id),
    expected_archive_messages:sourceRows*2,
    archived_messages:archived.messages,
    migrated_interactions:migrated,
    remaining_interactions:Math.max(0,sourceRows-migrated),
    conversation_collision:conversationCollision,
    existing_mismatches:integrity.existing_mismatches,
    coverage_mismatches:integrity.coverage_mismatches,
    coverage_complete:coverageComplete,
    status:!schema.supported?"SCHEMA_UNSUPPORTED":(
      conversationCollision?"CONVERSATION_ID_COLLISION":(
        integrity.existing_mismatches>0?"ARCHIVE_MISMATCH":(
          coverageComplete?"COMPLETE":"PENDING"
        )
      )
    ),
  };
}

export async function backfillLegacyInteractions(env,{afterId=0,limit=MAX_BATCH}={}){
  if(!env?.DB) throw Object.assign(new Error("GEN1_MIGRATION_DB_REQUIRED"),{code:"GEN1_MIGRATION_DB_REQUIRED",status:503});
  await migrate(env.DB);

  const exists=await tableExists(env.DB);
  if(!exists) return {...await getLegacyInteractionMigrationStatus(env),batch:{read:0,inserted_messages:0,after_id:boundedInt(afterId),last_id:null}};

  const columns=await legacyColumns(env.DB);
  const schema=schemaReport(columns);
  if(!schema.supported){
    const error=new Error("GEN1_INTERACTIONS_SCHEMA_UNSUPPORTED");
    error.code="GEN1_INTERACTIONS_SCHEMA_UNSUPPORTED";
    error.status=409;
    error.details=schema;
    throw error;
  }

  if(await legacyConversationCollision(env.DB)){
    const error=new Error("GEN1_CONVERSATION_ID_COLLISION");
    error.code="GEN1_CONVERSATION_ID_COLLISION";
    error.status=409;
    throw error;
  }
  const preIntegrity=await legacyIntegrity(env.DB);
  if(preIntegrity.existing_mismatches>0){
    const error=new Error("GEN1_ARCHIVE_ID_COLLISION_OR_MISMATCH");
    error.code="GEN1_ARCHIVE_ID_COLLISION_OR_MISMATCH";
    error.status=409;
    error.details=preIntegrity;
    throw error;
  }

  const cursor=boundedInt(afterId,{min:0});
  const boundedLimit=boundedInt(limit,{min:1,max:MAX_BATCH,fallback:MAX_BATCH});
  const rows=await env.DB.prepare(`SELECT id,created_at,user_text,assistant_text,model,feedback,correction
    FROM interactions
    WHERE id>?
    ORDER BY id ASC
    LIMIT ?`).bind(cursor,boundedLimit).all();
  const items=rows.results||[];
  if(items.length) await ensureLegacyConversation(env.DB,env.MELITURGOS_USER||"owner");

  let insertedMessages=0;
  for(const row of items){
    const ids=idsFor(row.id);
    const userResult=await env.DB.prepare(`INSERT OR IGNORE INTO archive_messages(
      id,conversation_id,device_id,role,content,attachments_json,model,
      capabilities_used_json,system_prompt_version,timestamp,provenance,metadata
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        ids.user,LEGACY_CONVERSATION_ID,null,"user",String(row.user_text||""),null,null,
        null,null,boundedInt(row.created_at),LEGACY_PROVENANCE,JSON.stringify(metadataFor(row,"user"))
      ).run();
    insertedMessages+=boundedInt(userResult?.meta?.changes);

    const assistantResult=await env.DB.prepare(`INSERT OR IGNORE INTO archive_messages(
      id,conversation_id,device_id,role,content,attachments_json,model,
      capabilities_used_json,system_prompt_version,timestamp,provenance,metadata
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        ids.assistant,LEGACY_CONVERSATION_ID,null,"assistant",String(row.assistant_text||""),null,
        row.model==null?null:String(row.model),null,null,boundedInt(row.created_at)+1,
        LEGACY_PROVENANCE,JSON.stringify(metadataFor(row,"assistant"))
      ).run();
    insertedMessages+=boundedInt(assistantResult?.meta?.changes);
  }

  const lastId=items.length?boundedInt(items[items.length-1].id):null;
  const status=await getLegacyInteractionMigrationStatus(env);
  return {
    ...status,
    batch:{
      read:items.length,
      inserted_messages:insertedMessages,
      after_id:cursor,
      last_id:lastId,
      limit:boundedLimit,
      replay_safe:insertedMessages===0&&items.length>0,
    },
  };
}

export const LEGACY_INTERACTION_MIGRATION = Object.freeze({
  source_table:LEGACY_TABLE,
  conversation_id:LEGACY_CONVERSATION_ID,
  provenance:LEGACY_PROVENANCE,
  required_columns:REQUIRED_COLUMNS,
  max_batch:MAX_BATCH,
});
