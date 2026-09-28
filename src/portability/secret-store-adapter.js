function req(fn,code){if(typeof fn!=='function')throw Object.assign(new TypeError(code),{code});return fn;}
function clean(v,max=240){return String(v||'').trim().slice(0,max);}
const FORBIDDEN_VALUE=/\b(?:bearer\s+|sk-|gh[pousr]_)[A-Za-z0-9._~+\/-]{6,}/i;

export class SecretStoreAdapter{
  constructor({id,provider,health,putRef,getRef,listRefs,deleteRef,rotateRef}={}){
    this.id=clean(id);this.provider=clean(provider);
    if(!this.id||!this.provider)throw Object.assign(new TypeError('SECRET_STORE_DESCRIPTOR_INVALID'),{code:'SECRET_STORE_DESCRIPTOR_INVALID'});
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
    this._put=req(putRef,'SECRET_STORE_PUT_REF_REQUIRED');
    this._get=req(getRef,'SECRET_STORE_GET_REF_REQUIRED');
    this._list=req(listRefs,'SECRET_STORE_LIST_REFS_REQUIRED');
    this._delete=req(deleteRef,'SECRET_STORE_DELETE_REF_REQUIRED');
    this._rotate=req(rotateRef,'SECRET_STORE_ROTATE_REF_REQUIRED');
  }
  health(){return this._health();}
  putRef(input){return this._put(input);}
  getRef(input){return this._get(input);}
  listRefs(input){return this._list(input);}
  deleteRef(input){return this._delete(input);}
  rotateRef(input){return this._rotate(input);}
}

function metadataOnly(value){
  const serialized=JSON.stringify(value||{});
  return !FORBIDDEN_VALUE.test(serialized)
    && !/(?:secret_value|plaintext|token_value|password_value)/i.test(serialized);
}

export async function proveSecretStoreAdapter(adapter){
  if(!(adapter instanceof SecretStoreAdapter))throw Object.assign(new TypeError('SECRET_STORE_ADAPTER_REQUIRED'),{code:'SECRET_STORE_ADAPTER_REQUIRED'});
  const health=await adapter.health();
  if(health?.ok===false)return{ok:false,status:'SECRET_STORE_HEALTH_FAILED',health};

  const ref='MEL_TEST_SECRET_'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
  const meta={purpose:'sovereignty-proof',scope:'test',rotation:'ephemeral'};

  const written=await adapter.putRef({ref,metadata:meta});
  if(written?.ok!==true||!metadataOnly(written))return{ok:false,status:'SECRET_STORE_REF_WRITE_FAILED'};

  const read=await adapter.getRef({ref});
  if(read?.ok!==true||!metadataOnly(read))return{ok:false,status:'SECRET_STORE_REF_READ_FAILED'};

  const listed=await adapter.listRefs({prefix:'MEL_TEST_SECRET_'});
  if(listed?.ok!==true||!Array.isArray(listed.refs)||!listed.refs.some(row=>row?.ref===ref)||!metadataOnly(listed)){
    return{ok:false,status:'SECRET_STORE_LIST_FAILED'};
  }

  const rotated=await adapter.rotateRef({ref,reason:'sovereignty-proof'});
  if(rotated?.ok!==true||!metadataOnly(rotated))return{ok:false,status:'SECRET_STORE_ROTATE_FAILED'};

  const deleted=await adapter.deleteRef({ref});
  if(deleted?.ok!==true)return{ok:false,status:'SECRET_STORE_DELETE_FAILED'};

  return{
    ok:true,status:'SECRET_STORE_ADAPTER_VERIFIED',
    provider:adapter.provider,adapter_id:adapter.id,
    metadata_only:true,plaintext_secret_export:false,
    write_ref:true,read_ref:true,list_refs:true,rotate:true,delete:true,
  };
}
