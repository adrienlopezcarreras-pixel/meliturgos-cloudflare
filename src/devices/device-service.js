import { port } from '../core/contracts.js';
export const methods=['register','list','sync','heartbeat','capabilities'];
export const createDeviceService = service => port('device',methods,{
 register: input=>service.registerDevice(input),
 sync: input=>service.sync(input),
 list: async()=> (await service.db.prepare('SELECT id,name,kind,last_seen_at,metadata FROM devices').all()).results,
 heartbeat: async({id})=>service.db.prepare('UPDATE devices SET last_seen_at=? WHERE id=?').bind(Date.now(),id).run(),
 capabilities: async({id})=>{const row=await service.db.prepare('SELECT metadata FROM devices WHERE id=?').bind(id).first(); return JSON.parse(row?.metadata || '{}').capabilities || [];}
});
