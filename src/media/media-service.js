import { DomainError, requireValue } from '../core/contracts.js';
export const MEDIA_TYPES=Object.freeze(['IMAGE','AUDIO','VIDEO','DOCUMENT']);
/** Binaries in MEDIA_BUCKET; metadata in existing media_assets, never base64 in D1.
 * D1 row commits after R2 upload; compensation deletes only newly allocated object.
 */
export class MediaService {
  constructor({DB,MEDIA_BUCKET},bus) {this.db=DB;this.bucket=MEDIA_BUCKET;this.bus=bus;}
  async upload({bytes,mime_type,filename,type='DOCUMENT'}) {
    requireValue(this.bucket,'R2_UNAVAILABLE',503);
    requireValue(bytes instanceof Uint8Array && bytes.length>0 && bytes.length<=10_000_000 && MEDIA_TYPES.includes(type),'INVALID_MEDIA');
    requireValue(typeof filename==='string' && filename.length<=255 && typeof mime_type==='string','INVALID_MEDIA');
    const id=crypto.randomUUID(),key='media/'+id;
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    await this.bucket.put(key,bytes,{httpMetadata:{contentType:mime_type}});
    try {await this.db.prepare("INSERT INTO media_assets(id,type,mime_type,filename,size,created_at,source,session_id,turn_id,r2_key,content_hash) VALUES(?,?,?,?,?,?,?,'',0,?,?)").bind(id,type,mime_type,filename,bytes.length,Date.now(),'gen2',key,hash).run();}
    catch(error) {await this.bucket.delete(key);throw error;}
    return {id,type,mime_type,filename,size:bytes.length};
  }
  async metadata({id}) {const row=await this.db.prepare('SELECT * FROM media_assets WHERE id=?').bind(id).first();requireValue(row,'MEDIA_NOT_FOUND',404);return row;}
  async get(input) {const row=await this.metadata(input);return this.bucket.get(row.r2_key);}
  async delete(input) {const row=await this.metadata(input);await this.bucket.delete(row.r2_key);await this.db.prepare('DELETE FROM media_assets WHERE id=?').bind(row.id).run();return {id:row.id,deleted:true};}
  async process({id,capability,input={}},context) {await this.metadata({id});if(!this.bus)throw new DomainError('MEDIA_PROCESSOR_UNCONFIGURED',503);return this.bus.execute(capability,{...input,id},context);}
  analyze(input,context) {return this.process(input,context);}
}
