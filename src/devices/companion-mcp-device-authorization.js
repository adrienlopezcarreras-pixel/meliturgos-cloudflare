// Fail-closed device authorization backed by a caller-provided owner/device lookup.
// Deliberately not mounted; database adapter and OAuth identity mapping still required.
export function createCompanionDeviceAuthorization({lookupOwnerDevice}={}){
 if(typeof lookupOwnerDevice!=='function')throw Error('MCP_DEVICE_LOOKUP_REQUIRED');
 return async (principal,deviceId)=>{
  if(!principal||typeof principal.subject!=='string'||!principal.subject||typeof deviceId!=='string'||!deviceId||deviceId.length>200)return false;
  try{
   const record=await lookupOwnerDevice(principal.subject,deviceId);
   return record?.owner_subject===principal.subject&&record?.device_id===deviceId&&record?.revoked!==true&&record?.paired===true;
  }catch{return false;}
 };
}
