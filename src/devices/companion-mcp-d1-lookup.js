// D1 read-only adapter for Companion MCP. Requires an explicit owner->device grant.
// No implicit permission based solely on existing computer_devices pairing.
export function makeCompanionD1DeviceLookup(db){
 if(typeof db?.prepare!=='function')throw Error('MCP_D1_REQUIRED');
 return async (subject,id)=>{
  if(typeof subject!=='string'||!subject||subject.length>256||typeof id!=='string'||!id||id.length>200)return null;
  // Separate explicit, revocable authorization table must be provisioned by an owner-approved migration.
  const row=await db.prepare(
   'SELECT g.owner_subject, g.device_id, g.revoked, d.id AS paired_id FROM companion_mcp_device_grants g INNER JOIN computer_devices d ON d.id=g.device_id WHERE g.owner_subject=? AND g.device_id=? LIMIT 1'
  ).bind(subject,id).first();
  if(!row)return null;
  return {owner_subject:row.owner_subject,device_id:row.device_id,revoked:Number(row.revoked)!==0,paired:row.paired_id===id};
 };
}
