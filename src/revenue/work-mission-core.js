/**
 * Single-purpose MEL WORK execution core. Produces a durable, reviewable artifact
 * even when an independent validator cannot certify marketplace acceptance.
 * Drafts are never submissions, earnings or verified marketplace deliverables.
 */
export async function executeWorkMission({db,mission,execute,verify=async()=>({passed:false}),now=()=>new Date().toISOString()}={}){
 if(typeof db?.prepare!=='function'||typeof execute!=='function')throw new TypeError('WORK_RUNTIME_REQUIRED');
 const id=typeof mission?.id==='string'?mission.id.trim():'';
 const description=typeof mission?.description==='string'?mission.description.trim():'';
 if(!id||id.length>160||!description||description.length>6000)throw new TypeError('WORK_MISSION_INVALID');
 await db.prepare('CREATE TABLE IF NOT EXISTS mel_work_missions (id TEXT PRIMARY KEY, description TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, last_error TEXT, artifact_id TEXT, updated_at TEXT NOT NULL)').run();
 await db.prepare('INSERT OR IGNORE INTO mel_work_missions (id,description,state,attempts,updated_at) VALUES (?,?,?,?,?)').bind(id,description,'NEW',0,now()).run();
 const current=await db.prepare('SELECT id,description,state,attempts,artifact_id FROM mel_work_missions WHERE id=?').bind(id).first();
 if(current?.description!==description)throw new Error('WORK_MISSION_ID_REUSED');
 if(current?.state==='DRAFT_READY'&&current.artifact_id){
  const saved=await db.prepare('SELECT id,content,status FROM mel_work_artifacts WHERE id=?').bind(current.artifact_id).first();
  if(saved?.id===current.artifact_id){
   let status=saved.status;
   if(status==='DRAFT_UNVERIFIED'){
    let check=false;try{check=(await verify({mission,content:saved.content,artifactId:saved.id}))?.passed===true}catch{}
    if(check){await db.prepare('UPDATE mel_work_artifacts SET status=? WHERE id=?').bind('VERIFIED_LOCALLY',saved.id).run();status='VERIFIED_LOCALLY'}
   }
   return {artifactId:saved.id,missionId:id,status,submitted:false,paid:false,reused:true};
  }
 }
 // Atomic claim: concurrent invocations may not both execute the same mission.
 const timestamp=now();
 const cutoff=new Date(Date.parse(timestamp)-15*60*1000).toISOString();
 const claimed=await db.prepare("UPDATE mel_work_missions SET state=?,attempts=attempts+1,last_error=NULL,updated_at=? WHERE id=? AND (state IN ('NEW','FAILED') OR (state='RUNNING' AND updated_at<?))").bind('RUNNING',timestamp,id,cutoff).run();
 if(claimed?.meta?.changes!==1)throw new Error('WORK_MISSION_ALREADY_RUNNING');
 let response;
 try{response=await execute({id,description})}
 catch(error){
  await db.prepare('UPDATE mel_work_missions SET state=?,last_error=?,updated_at=? WHERE id=?').bind('FAILED',String(error?.message||'EXECUTION_FAILED').slice(0,120),now(),id).run();
  throw error;
 }
 const content=typeof response?.content==='string'?response.content:'';
 if(!content.trim()||content.length>12000){
  await db.prepare('UPDATE mel_work_missions SET state=?,last_error=?,updated_at=? WHERE id=?').bind('FAILED','WORK_ARTIFACT_EMPTY',now(),id).run();
  throw new Error('WORK_ARTIFACT_EMPTY');
 }
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id+'\n'+content));
 const artifactId='work-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 await db.prepare('CREATE TABLE IF NOT EXISTS mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)').run();
 // The result exists before validation; a validator is not a prerequisite for doing useful work.
 await db.prepare('INSERT OR IGNORE INTO mel_work_artifacts (id,mission_id,content,status,created_at) VALUES (?,?,?,?,?)').bind(artifactId,id,content,'DRAFT_UNVERIFIED',now()).run();
 const stored=await db.prepare('SELECT id, mission_id, content, status FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
 if(stored?.id!==artifactId||stored.mission_id!==id||stored.content!==content)throw new Error('WORK_ARTIFACT_PERSISTENCE_UNCONFIRMED');
 let passed=false;
 try{passed=(await verify({mission,content,artifactId}))?.passed===true}catch{}
 if(passed){
  await db.prepare('UPDATE mel_work_artifacts SET status=? WHERE id=?').bind('VERIFIED_LOCALLY',artifactId).run();
 }
 const final=await db.prepare('SELECT id, mission_id, content, status FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
 if(final?.id!==artifactId||final.content!==content||final.status!==(passed?'VERIFIED_LOCALLY':'DRAFT_UNVERIFIED'))throw new Error('WORK_ARTIFACT_PERSISTENCE_UNCONFIRMED');
 await db.prepare('UPDATE mel_work_missions SET state=?,artifact_id=?,last_error=NULL,updated_at=? WHERE id=?').bind('DRAFT_READY',artifactId,now(),id).run();
 return {artifactId,missionId:id,status:final.status,submitted:false,paid:false};
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
  if(assessment?.eligible!==true||!Number.isSafeInteger(assessment.confidenceBps)||assessment.confidenceBps<9000||
    assessment.requiresHuman!==false||assessment.requiresPhysicalWorld!==false||
    assessment.requiresSecrets!==false||assessment.requestsUnsafeAction!==false)continue;
  try{
   return await executeWorkMission({db,mission,execute:args=>execute(args,mission,assessment),verify});
  }catch(error){
   // A failed solver can be tried on another task; a broken D1 persistence path cannot.
   if(error?.message==='WORK_ARTIFACT_EMPTY'||error?.message==='WORK_SOLVER_OUTPUT_INVALID'||error?.message==='WORK_SOLVER_INDEPENDENCE_NOT_PROVEN')continue;
   throw error;
  }
 }
 return {status:'NO_ELIGIBLE_MISSION',artifactId:null,submitted:false,paid:false};
}
