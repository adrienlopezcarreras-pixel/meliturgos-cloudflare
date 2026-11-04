import { planCouncilDiffBatches } from './council-diff-batches.js';
const enc = new TextEncoder();
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const bytes = text => enc.encode(text).byteLength;
const reject = (code,status=400) => ({status,result:{ok:false,code,decision:'BLOCKED'}});
const keyFor = (h,b,d,i) => 'council-diff-batch:'+h+':'+b+':'+d+':'+i;
async function digest(value,cryptoImpl) {
  const raw=await cryptoImpl.subtle.digest('SHA-256',enc.encode(value));
  return Array.from(new Uint8Array(raw),n=>n.toString(16).padStart(2,'0')).join('');
}
async function load(db,key) {
  const row=await db.prepare('SELECT metadata_json FROM dev_bridge_state WHERE bridge_id=?').bind(key).first();
  try{return JSON.parse(row?.metadata_json||'null');}catch{return null;}
}
async function persist(db,key,record,now) {
  const sql=`INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)
    ON CONFLICT(bridge_id) DO UPDATE SET last_seen=excluded.last_seen,
    status=excluded.status,metadata_json=excluded.metadata_json`;
  await db.prepare(sql).bind(key,now,record.decision,JSON.stringify(record)).run();
}
// Approval requires two distinct model identities and two nonempty reasons;
// a result flag, duplicated identity or missing review never establishes quorum.
const independentQuorum = reviews => Array.isArray(reviews) &&
  new Set(reviews.filter(row=>row?.verdict==='APPROVE'
    &&typeof row.summary==='string' &&row.summary.trim())
    .map(row=>String(row.model||'').trim()).filter(Boolean)).size>=2;

const isValid = b => b && SHA.test(b.head||'') && SHA.test(b.base||'')
  && DIGEST.test(b.root_sha256||'')
  && Number.isInteger(b.batch_count) && b.batch_count>=2 && b.batch_count<=32
  && Number.isInteger(b.total_bytes) && b.total_bytes>48_000 && b.total_bytes<=512_000
  && Number.isInteger(b.file_count) && b.file_count>=b.batch_count && b.file_count<=256;

export async function handleCouncilBatchedReview(env,body,{
  review,now=Date.now(),cryptoImpl=globalThis.crypto,
}={}) {
  if (!env?.DB?.prepare || typeof review!=='function' || !cryptoImpl?.subtle
      || !isValid(body) || (body.mode!=='batch'&&body.mode!=='final'))
    return reject('COUNCIL_BATCH_INPUT_INVALID');
  const {head,base,root_sha256:root,batch_count:count,total_bytes:total,
    file_count:files}=body;
  if(body.mode==='batch'){
    const i=body.batch_index;
    if(!Number.isInteger(i)||i<1||i>count||typeof body.diff!=='string'
        || !body.diff.startsWith('diff --git a/')||bytes(body.diff)>44_000
        || !DIGEST.test(body.batch_sha256||''))return reject('COUNCIL_BATCH_INPUT_INVALID');
    const sha=await digest(body.diff,cryptoImpl);
    if(sha!==body.batch_sha256)return reject('COUNCIL_BATCH_DIGEST_MISMATCH',409);
    const key=keyFor(head,base,root,i);
    const prior=await load(env.DB,key);
    if(prior && (prior.sha256!==sha||prior.count!==count||prior.total!==total
        ||prior.files!==files||prior.head!==head||prior.base!==base
        ||prior.root!==root||prior.diff!==body.diff))
      return reject('COUNCIL_BATCH_IMMUTABLE_CONFLICT',409);
    // Legacy or corrupted cached votes may lack the two independent,
    // reasoned approvals that current releases require. Never trust the
    // stored APPROVED label alone: re-review rather than promoting a cache.
    if(prior?.decision==='APPROVED' && independentQuorum(prior.reviews))return {status:200,result:{
      ok:true,decision:'PENDING_ALL_BATCH_REVIEWS',batch_decision:'APPROVED',
      cached:true,batch_index:i,head,root_sha256:root}};
    if(prior?.decision==='REJECTED')return {status:409,result:{
      ok:false,decision:'COUNCIL_BATCH_NOT_APPROVED',batch_decision:'REJECTED',
      batch_index:i,head,root_sha256:root}};
    const vote=await review(env,{diff:body.diff,goal:'Independent Council review of complete file batch '
      +i+'/'+count+' for '+head+'; each batch and the final integration need separate real approvals.',
      attempts:Math.max(0,Number(prior?.attempts||0))});
    const verifiedDecision=vote?.decision==='APPROVED'&&!independentQuorum(vote?.reviews)
      ?'COUNCIL_BATCH_QUORUM_UNPROVEN':vote?.decision||'COUNCIL_BATCH_VOTE_MISSING';
    const record={head,base,root,count,total,files,index:i,sha256:sha,
      diff:body.diff,decision:verifiedDecision,reviews:Array.isArray(vote?.reviews)?vote.reviews:[],
      attempts:Number(prior?.attempts||0)+1,reviewed_at:now};
    await persist(env.DB,key,record,now);
    return {status:200,result:{ok:true,decision:verifiedDecision==='APPROVED'
      ?'PENDING_ALL_BATCH_REVIEWS':'COUNCIL_BATCH_NOT_APPROVED',
      batch_decision:verifiedDecision,head,root_sha256:root,batch_index:i}};
  }
  const records=[];
  for(let i=1;i<=count;i++){
    const row=await load(env.DB,keyFor(head,base,root,i));
    if(!row||row.head!==head||row.base!==base||row.root!==root
      ||row.count!==count||row.total!==total||row.files!==files||row.index!==i
      ||row.decision!=='APPROVED'||!Array.isArray(row.reviews)
      ||!independentQuorum(row.reviews))
      return reject('COUNCIL_BATCH_REVIEWS_INCOMPLETE',409);
    if(await digest(row.diff,cryptoImpl)!==row.sha256)
      return reject('COUNCIL_BATCH_STORED_DIFF_TAMPERED',409);
    records.push(row);
  }
  const entireDiff=records.map(x=>x.diff).join('');
  const rebuilt=planCouncilDiffBatches(entireDiff);
  if(!rebuilt.ok||rebuilt.totalBytes!==total||rebuilt.fileCount!==files
      ||rebuilt.batchCount!==count||await digest(entireDiff,cryptoImpl)!==root
      ||rebuilt.batches.some((chunk,i)=>chunk.diff!==records[i].diff))
    return reject('COUNCIL_BATCH_REASSEMBLY_MISMATCH',409);
  const key='council-review:'+head;
  const previous=await load(env.DB,key);
  if(previous && (previous.root_sha256!==root||previous.base!==base
      ||previous.batch_count!==count))return reject('COUNCIL_FINAL_REVIEW_CONFLICT',409);
  // Re-validate the whole cache, including distinct independent reviewers,
  // immutable batch hashes and metadata. An old bare APPROVED must be re-voted.
  const cacheProven=previous?.mode==='COMPLETE_INDEPENDENT_MULTI_BATCH_REVIEW'
    && previous.file_count===files && previous.total_bytes===total
    && Array.isArray(previous.batch_hashes) && previous.batch_hashes.length===count
    && previous.batch_hashes.every((hash,i)=>hash===records[i].sha256)
    && independentQuorum(previous.reviews);
  if(previous?.decision==='APPROVED' && cacheProven)return {status:200,result:{
    ok:true,cached:true,decision:'APPROVED',head,root_sha256:root,
    batch_count:count,complete_review:true}};
  if(previous?.decision==='REJECTED')return reject('COUNCIL_FINAL_REJECTED',409);
  const reviewSummary=records.map(row=>
    'LOT '+row.index+'/'+count+' SHA256='+row.sha256+'; fichiers='+
    rebuilt.batches[row.index-1].paths.join(', ')+
    '; independent verdict='+row.decision+
    '; reviewers='+row.reviews.map(r=>r.model+':'+r.verdict+':'+String(r.summary||'').slice(0,180)).join(' | ')
  ).join('\n');
  const finalVote=await review(env,{
    diff:'INTEGRATION REVIEW of an exact, fully reconstructed and SHA256-checked code diff.\n'
      +'SHA='+head+' BASE='+base+' ROOT_SHA256='+root+'\n'
      +reviewSummary+'\nREJECT if independent per-batch evidence or cross-batch consistency is insufficient.',
    goal:'Independent Council final architecture/security/integration decision; do not approve a mere artifact or code summary',
    attempts:Math.max(0,Number(previous?.attempts||0)),
  });
  // The separate integration verdict must meet the same independent, reasoned
  // model quorum as every batch. A bare APPROVED flag is never sufficient.
  const finalDecision=finalVote?.decision==='APPROVED'&&!independentQuorum(finalVote?.reviews)
    ?'COUNCIL_FINAL_QUORUM_UNPROVEN':finalVote?.decision||'COUNCIL_FINAL_VOTE_MISSING';
  const final={decision:finalDecision,head,base,root_sha256:root,
    batch_count:count,file_count:files,total_bytes:total,
    batch_hashes:records.map(row=>row.sha256),reviews:finalVote?.reviews||[],
    reviewed_at:now,attempts:Number(previous?.attempts||0)+1,
    mode:'COMPLETE_INDEPENDENT_MULTI_BATCH_REVIEW'};
  await persist(env.DB,key,final,now);
  return {status:200,result:{ok:true,decision:final.decision,head,
    root_sha256:root,batch_count:count,complete_review:final.decision==='APPROVED'}};
}
