// Read-only Companion status adapter for the future MCP endpoint.
// A D1 grant check MUST happen before this function is called.
// This code is not mounted on a public route.
export function makeCompanionD1StatusReader(db,{now=()=>Date.now()}={}){
 if(typeof db?.prepare!=='function')throw Error('MCP_STATUS_DB_REQUIRED');
 return async (_principal,id)=>{
  if(typeof id!=='string'||!id||id.length>200)throw Error('MCP_STATUS_DEVICE_ID_INVALID');
  const row=await db.prepare('SELECT id, halted, last_seen_at FROM computer_devices WHERE id=? LIMIT 1').bind(id).first();
  if(!row||row.id!==id)throw Error('MCP_STATUS_DEVICE_NOT_FOUND');
  const seen=Number(row.last_seen_at||0);
  return {id,halted:Number(row.halted)===1,online:Number.isFinite(seen)&&seen>0&&now()-seen>=0&&now()-seen<35000,last_seen_at:seen};
 };
}
