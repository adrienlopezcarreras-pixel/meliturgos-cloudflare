/**
 * Single-purpose MEL WORK execution core. Produces a durable, reviewable artifact
 * even when an independent validator cannot certify marketplace acceptance.
 * Drafts are never submissions, earnings or verified marketplace deliverables.
 */
export async function executeWorkMission({db,mission,execute,verify=async()=>({passed:false}),humanSteps=[],now=()=>new Date().toISOString()}={}){
 if(typeof db?.prepare!=='function'||typeof execute!=='function')throw new TypeError('WORK_RUNTIME_REQUIRED');
 const id=typeof mission?.id==='string'?mission.id.trim():'';
 const description=typeof mission?.description==='string'?mission.description.trim():'';
 if(!id||id.length>160||!description||description.length>6000)throw new TypeError('WORK_MISSION_INVALID');
 await db.prepare("CREATE TABLE IF NOT EXISTS mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, human_steps TEXT NOT NULL DEFAULT '[]', owner_note TEXT, decided_at TEXT)").run();
 for(const column of ["human_steps TEXT NOT NULL DEFAULT '[]'","owner_note TEXT","decided_at TEXT"]){try{await db.prepare('ALTER TABLE mel_work_artifacts ADD COLUMN '+column).run()}catch(error){if(!/duplicate column/i.test(String(error)))throw error}}
 await db.prepare('CREATE TABLE IF NOT EXISTS mel_work_missions (id TEXT PRIMARY KEY, description TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, last_error TEXT, artifact_id TEXT, updated_at TEXT NOT NULL)').run();
 await db.prepare('INSERT OR IGNORE INTO mel_work_missions (id,description,state,attempts,updated_at) VALUES (?,?,?,?,?)').bind(id,description,'NEW',0,now()).run();
 const current=await db.prepare('SELECT id,description,state,attempts,artifact_id FROM mel_work_missions WHERE id=?').bind(id).first();
 if(current?.description!==description)throw new Error('WORK_MISSION_ID_REUSED');
 if(current?.state==='DRAFT_READY'&&current.artifact_id){
  const saved=await db.prepare('SELECT id,content,status FROM mel_work_artifacts WHERE id=?').bind(current.artifact_id).first();
  if(saved?.id===current.artifact_id){
   let status=saved.status;
   if(['DRAFT_UNVERIFIED','VERIFIED_LOCALLY'].includes(status)){
    await db.prepare("UPDATE mel_work_artifacts SET status=?,human_steps=? WHERE id=? AND status IN ('DRAFT_UNVERIFIED','VERIFIED_LOCALLY')").bind('DRAFT_FOR_OWNER',JSON.stringify(humanSteps),saved.id).run();
    status='DRAFT_FOR_OWNER';
   }
   return {artifactId:saved.id,missionId:id,status,humanSteps,requiresOwnerApproval:status==='DRAFT_FOR_OWNER',submitted:false,paid:false,reused:true};
  }
 }
 // Atomic claim: concurrent invocations may not both execute the same mission.
 const timestamp=now();
 const cutoff=new Date(Date.parse(timestamp)-15*60*1000).toISOString();
 const claimed=await db.prepare("UPDATE mel_work_missions SET state=?,attempts=attempts+1,last_error=NULL,updated_at=? WHERE id=? AND (state IN ('NEW','FAILED') OR (state IN ('RUNNING','COMMITTING') AND updated_at<?))").bind('RUNNING',timestamp,id,cutoff).run();
 if(claimed?.meta?.changes!==1)throw new Error('WORK_MISSION_ALREADY_RUNNING');
 const owner=await db.prepare('SELECT attempts FROM mel_work_missions WHERE id=?').bind(id).first();
 const attempt=owner?.attempts;
 if(!Number.isSafeInteger(attempt))throw new Error('WORK_MISSION_OWNERSHIP_LOST');
 let response;
 try{response=await execute({id,description})}
 catch(error){
  await db.prepare('UPDATE mel_work_missions SET state=?,last_error=?,updated_at=? WHERE id=? AND state=? AND attempts=?').bind('FAILED',String(error?.message||'EXECUTION_FAILED').slice(0,120),now(),id,'RUNNING',attempt).run();
  throw error;
 }
 const content=typeof response?.content==='string'?response.content:'';
 if(!content.trim()||content.length>12000){
  await db.prepare('UPDATE mel_work_missions SET state=?,last_error=?,updated_at=? WHERE id=? AND state=? AND attempts=?').bind('FAILED','WORK_ARTIFACT_EMPTY',now(),id,'RUNNING',attempt).run();
  throw new Error('WORK_ARTIFACT_EMPTY');
 }
 const committed=await db.prepare("UPDATE mel_work_missions SET state=?,updated_at=? WHERE id=? AND state='RUNNING' AND attempts=?").bind('COMMITTING',now(),id,attempt).run();
 if(committed?.meta?.changes!==1)throw new Error('WORK_MISSION_OWNERSHIP_LOST');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id+'\n'+content));
 const artifactId='work-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 // The result exists before validation; a validator is not a prerequisite for doing useful work.
 const written=await db.prepare("INSERT OR IGNORE INTO mel_work_artifacts (id,mission_id,content,status,created_at,human_steps) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM mel_work_missions WHERE id=? AND state='COMMITTING' AND attempts=?)").bind(artifactId,id,content,'DRAFT_FOR_OWNER',now(),JSON.stringify(humanSteps),id,attempt).run();
 if(written?.meta?.changes!==1){
  const ownerRow=await db.prepare('SELECT state,attempts FROM mel_work_missions WHERE id=?').bind(id).first();
  if(ownerRow?.attempts!==attempt||ownerRow?.state!=='COMMITTING')throw new Error('WORK_MISSION_OWNERSHIP_LOST');
 }
 const stored=await db.prepare('SELECT id, mission_id, content, status FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
 if(stored?.id!==artifactId||stored.mission_id!==id||stored.content!==content)throw new Error('WORK_ARTIFACT_PERSISTENCE_UNCONFIRMED');
 // Owner review, not local model validation, closes this draft.
 const final=await db.prepare('SELECT id, mission_id, content, status FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
 if(final?.id!==artifactId||final.content!==content||final.status!=='DRAFT_FOR_OWNER')throw new Error('WORK_ARTIFACT_PERSISTENCE_UNCONFIRMED');
 const finalized=await db.prepare("UPDATE mel_work_missions SET state=?,artifact_id=?,last_error=NULL,updated_at=? WHERE id=? AND state='COMMITTING' AND attempts=?").bind('DRAFT_READY',artifactId,now(),id,attempt).run();
 if(finalized?.meta?.changes!==1)throw new Error('WORK_MISSION_OWNERSHIP_LOST');
 return {artifactId,missionId:id,status:final.status,humanSteps,requiresOwnerApproval:true,submitted:false,paid:false};
}

/** Provider-independent orchestration: the source supplies missions, the executor produces
 * content and D1 is the canonical record. Never claims or submits marketplace work. */
export async function runDirectWork({db,listMissions,assess,execute,verify,maxAssessments=3}={}){
 if(typeof listMissions!=='function'||typeof assess!=='function'||typeof execute!=='function')throw new TypeError('WORK_SOURCE_ASSESSOR_EXECUTOR_REQUIRED');
 const missions=await listMissions();
 if(!Array.isArray(missions))throw new TypeError('WORK_MISSION_LIST_INVALID');
 // Selection belongs in the engine. Source metadata alone never approves an autonomous task.
 const candidates=missions.filter(m=>m?.eligibleForDraft===true&&typeof m?.description==='string'&&m.description.trim()&&m.description.length<=6000);
 const budget=Math.max(0,Math.min(3,Number.isSafeInteger(maxAssessments)?maxAssessments:3));
 for(const mission of candidates.slice(0,budget)){
  let assessment;
  try{assessment=await assess({mission})}catch{continue}
  if(assessment?.draftable!==true||!Number.isSafeInteger(assessment.confidenceBps)||assessment.confidenceBps<7000||
    assessment.requiresPhysicalWorld===true||assessment.requiresSecrets===true||assessment.requestsUnsafeAction===true)continue;
  const humanSteps=Array.isArray(assessment.humanSteps)?assessment.humanSteps.filter(x=>typeof x==='string'&&x.trim()).slice(0,8).map(x=>x.slice(0,200)):[];
  if(!humanSteps.length)humanSteps.push(assessment.requiresHuman===true?'Publier ou soumettre personnellement le livrable après vérification.':'Vérifier le livrable avant toute remise.');
  try{
   const output=await executeWorkMission({db,mission,execute:args=>execute(args,mission,assessment),verify,humanSteps});
   if(['APPROVED_BY_OWNER','REJECTED_BY_OWNER'].includes(output.status))continue;
   return {...output,status:'DRAFT_FOR_OWNER',humanSteps,requiresOwnerApproval:true};
  }catch(error){
   // A failed solver can be tried on another task; a broken D1 persistence path cannot.
   if(error?.message==='WORK_ARTIFACT_EMPTY'||error?.message==='WORK_SOLVER_OUTPUT_INVALID'||error?.message==='WORK_SOLVER_INDEPENDENCE_NOT_PROVEN')continue;
   throw error;
  }
 }
 return {status:'NO_ELIGIBLE_MISSION',artifactId:null,submitted:false,paid:false};
}
