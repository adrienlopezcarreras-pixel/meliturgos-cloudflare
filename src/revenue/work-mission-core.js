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
 const response=await execute({id,description});
 const content=typeof response?.content==='string'?response.content:'';
 if(!content.trim()||content.length>12000)throw new Error('WORK_ARTIFACT_EMPTY');
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
  return executeWorkMission({db,mission,execute:args=>execute(args,mission,assessment),verify});
 }
 return {status:'NO_ELIGIBLE_MISSION',artifactId:null,submitted:false,paid:false};
}
