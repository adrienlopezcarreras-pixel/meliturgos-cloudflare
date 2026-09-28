function required(fn, code) {
  if (typeof fn !== 'function') {
    const error = new TypeError(code);
    error.code = code;
    throw error;
  }
  return fn;
}

function clean(value,max=200){return String(value||'').trim().slice(0,max);}

export class SourceControlAdapter {
  constructor({
    id,
    provider,
    readRef,
    readFile,
    writeFile,
    createRef,
    updateRef,
    compareRefs,
    health,
  }={}) {
    this.id=clean(id);
    this.provider=clean(provider);
    if(!this.id||!this.provider) throw Object.assign(new TypeError('SOURCE_CONTROL_DESCRIPTOR_INVALID'),{code:'SOURCE_CONTROL_DESCRIPTOR_INVALID'});
    this._readRef=required(readRef,'SOURCE_CONTROL_READ_REF_REQUIRED');
    this._readFile=required(readFile,'SOURCE_CONTROL_READ_FILE_REQUIRED');
    this._writeFile=required(writeFile,'SOURCE_CONTROL_WRITE_FILE_REQUIRED');
    this._createRef=required(createRef,'SOURCE_CONTROL_CREATE_REF_REQUIRED');
    this._updateRef=required(updateRef,'SOURCE_CONTROL_UPDATE_REF_REQUIRED');
    this._compareRefs=required(compareRefs,'SOURCE_CONTROL_COMPARE_REFS_REQUIRED');
    this._health=typeof health==='function'?health:async()=>({ok:true,status:'UNKNOWN'});
  }

  readRef(input){return this._readRef(input);}
  readFile(input){return this._readFile(input);}
  writeFile(input){return this._writeFile(input);}
  createRef(input){return this._createRef(input);}
  updateRef(input){return this._updateRef(input);}
  compareRefs(input){return this._compareRefs(input);}
  health(){return this._health();}
}

export async function proveSourceControlAdapter(adapter,{scratchPrefix='mel-sovereignty-proof'}={}) {
  if(!(adapter instanceof SourceControlAdapter)) throw Object.assign(new TypeError('SOURCE_CONTROL_ADAPTER_REQUIRED'),{code:'SOURCE_CONTROL_ADAPTER_REQUIRED'});
  const health=await adapter.health();
  if(health?.ok===false) return {ok:false,status:'SOURCE_CONTROL_HEALTH_FAILED',health};

  const main=await adapter.readRef({ref:'main'});
  const sha=clean(main?.sha,80);
  if(!/^[0-9a-f]{40}$/i.test(sha)) return {ok:false,status:'SOURCE_CONTROL_MAIN_SHA_INVALID'};

  const read=await adapter.readFile({ref:sha,path:'package.json'});
  if(typeof read?.content!=='string' || !read.content.length) return {ok:false,status:'SOURCE_CONTROL_READ_FAILED'};

  const branch=`${scratchPrefix}-${sha.slice(0,12)}`;
  const created=await adapter.createRef({ref:branch,sha});
  if(created?.ok!==true) return {ok:false,status:'SOURCE_CONTROL_CREATE_REF_FAILED'};

  const written=await adapter.writeFile({
    ref:branch,
    path:'.mel-sovereignty-proof.txt',
    content:`source-control-proof ${sha}\n`,
    message:'MEL source-control sovereignty proof',
  });
  const candidateSha=clean(written?.sha,80);
  if(!/^[0-9a-f]{40}$/i.test(candidateSha)) return {ok:false,status:'SOURCE_CONTROL_WRITE_FAILED'};

  const compared=await adapter.compareRefs({base:sha,head:candidateSha});
  if(compared?.ok!==true) return {ok:false,status:'SOURCE_CONTROL_COMPARE_FAILED'};

  const rolledBack=await adapter.updateRef({ref:branch,sha,force:true});
  if(rolledBack?.ok!==true) return {ok:false,status:'SOURCE_CONTROL_ROLLBACK_FAILED'};

  return {
    ok:true,
    status:'SOURCE_CONTROL_ADAPTER_VERIFIED',
    provider:adapter.provider,
    adapter_id:adapter.id,
    source_sha:sha,
    candidate_sha:candidateSha,
    read:true,
    write:true,
    create_ref:true,
    compare:true,
    rollback:true,
  };
}
