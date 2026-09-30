function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}

export class ObjectStorageAdapter{
  constructor({id,provider,put,get,deleteObject,list,health}={}){
    this.id=clean(id);this.provider=clean(provider);
    if(!this.id||!this.provider)throw Object.assign(new TypeError('OBJECT_STORAGE_DESCRIPTOR_INVALID'),{code:'OBJECT_STORAGE_DESCRIPTOR_INVALID'});
    this._put=req(put,'OBJECT_STORAGE_PUT_REQUIRED');
    this._get=req(get,'OBJECT_STORAGE_GET_REQUIRED');
    this._delete=req(deleteObject,'OBJECT_STORAGE_DELETE_REQUIRED');
    this._list=req(list,'OBJECT_STORAGE_LIST_REQUIRED');
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
  }
  health(){return this._health();}
  put(input){return this._put(input);}
  get(input){return this._get(input);}
  deleteObject(input){return this._delete(input);}
  list(input){return this._list(input);}
}

async function sha256Hex(bytes){
  const value=bytes instanceof Uint8Array?bytes:new TextEncoder().encode(String(bytes||''));
  const digest=await crypto.subtle.digest('SHA-256',value);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function asBytes(value){
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(typeof value==='string')return new TextEncoder().encode(value);
  throw Object.assign(new TypeError('OBJECT_STORAGE_BYTES_REQUIRED'),{code:'OBJECT_STORAGE_BYTES_REQUIRED'});
}

export async function proveObjectStorageAdapter(adapter,{prefix='mel-sovereignty-proof'}={}){
  if(!(adapter instanceof ObjectStorageAdapter))throw Object.assign(new TypeError('OBJECT_STORAGE_ADAPTER_REQUIRED'),{code:'OBJECT_STORAGE_ADAPTER_REQUIRED'});
  const health=await adapter.health();
  if(health?.ok===false)return{ok:false,status:'OBJECT_STORAGE_HEALTH_FAILED',health};

  const nonce=crypto.randomUUID();
  const key=`${prefix}/${nonce}.bin`;
  const payload=new TextEncoder().encode(`MEL_OBJECT_STORAGE_PROOF:${nonce}`);
  const expected=await sha256Hex(payload);

  const written=await adapter.put({key,bytes:payload,content_type:'application/octet-stream'});
  if(written?.ok!==true)return{ok:false,status:'OBJECT_STORAGE_WRITE_FAILED'};

  const read=await adapter.get({key});
  if(read?.ok!==true||read?.bytes==null)return{ok:false,status:'OBJECT_STORAGE_READ_FAILED'};
  const actual=await sha256Hex(asBytes(read.bytes));
  if(actual!==expected)return{ok:false,status:'OBJECT_STORAGE_ROUNDTRIP_MISMATCH'};

  const listed=await adapter.list({prefix});
  if(listed?.ok!==true||!Array.isArray(listed.keys)||!listed.keys.includes(key)){
    return{ok:false,status:'OBJECT_STORAGE_LIST_FAILED'};
  }

  const deleted=await adapter.deleteObject({key});
  if(deleted?.ok!==true)return{ok:false,status:'OBJECT_STORAGE_DELETE_FAILED'};

  const after=await adapter.get({key});
  if(after?.found!==false&&after?.status!=='NOT_FOUND')return{ok:false,status:'OBJECT_STORAGE_DELETE_VERIFY_FAILED'};

  return{
    ok:true,
    status:'OBJECT_STORAGE_ADAPTER_VERIFIED',
    provider:adapter.provider,
    adapter_id:adapter.id,
    write:true,read:true,list:true,delete:true,roundtrip:true,
    checksum:expected,
  };
}
