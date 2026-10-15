function clean(v,max=4000){return String(v??'').trim().slice(0,max);}
function error(code,status=503){const e=new Error(code);e.code=code;e.status=status;return e;}

export function normalizeOllamaPerformanceEvidence(raw){
  if(!raw||typeof raw!=='object')return null;
  const safeInteger=(v)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
  const output_tokens=safeInteger(raw.output_tokens);
  const eval_duration_ns=safeInteger(raw.eval_duration_ns);
  const gpu_vram_bytes=safeInteger(raw.gpu_vram_bytes);
  const tps=typeof raw.tokens_per_second==='number'&&Number.isFinite(raw.tokens_per_second)&&raw.tokens_per_second>=0&&raw.tokens_per_second<=1e6?raw.tokens_per_second:null;
  const gpu_evidence=raw.gpu_evidence==='OLLAMA_VRAM_RESIDENCY_REPORTED'&&gpu_vram_bytes>0
    ?'OLLAMA_VRAM_RESIDENCY_REPORTED':'UNVERIFIED';
  return {output_tokens,eval_duration_ns,tokens_per_second:tps,
    gpu_vram_bytes:gpu_evidence==='OLLAMA_VRAM_RESIDENCY_REPORTED'?gpu_vram_bytes:null,
    gpu_evidence};
}

function messagesFor(input,context={}){
  const rows=[];
  if(context?.system)rows.push({role:'system',content:clean(context.system,12000)});
  if(Array.isArray(input)){
    for(const row of input.slice(0,16)){
      const role=['system','user','assistant'].includes(String(row?.role||''))?String(row.role):'user';
      const content=clean(row?.content,12000);
      if(content)rows.push({role,content});
    }
  }else{
    const content=typeof input==='string'?input:JSON.stringify(input??{});
    if(clean(content,12000))rows.push({role:'user',content:clean(content,12000)});
  }
  if(!rows.length)throw error('LOCAL_AI_INPUT_REQUIRED',400);
  return rows;
}

export function createCompanionLocalAiAdapter({execute,model=null}={}){
  if(typeof execute!=='function')throw new TypeError('COMPANION_AI_EXECUTOR_REQUIRED');
  const selectedModel=clean(model,240)||null;
  return Object.freeze({
    id:'companion-local-ai',
    providerId:'local-companion-ai',
    modelId:selectedModel||'auto-local',
    estimatedCost:0,
    costProvenance:Object.freeze({
      verified:true,
      addedCost:0,
      source:'existing-owner-windows-hardware',
      authorization:Object.freeze({approved:true,policy:'ZERO_EURO',authority:'owner'}),
    }),
    async invoke({input,context={}}={}){
      const settings=context?.inference_settings||{};
      const result=await execute({
        capability:'sovereignty.ai',
        action:'invoke',
        payload:{
          messages:messagesFor(input,context),
          ...(selectedModel?{model:selectedModel}:{}),
          temperature:Number.isFinite(Number(settings.temperature))?Math.max(0,Math.min(2,Number(settings.temperature))):0,
          max_tokens:Number.isFinite(Number(settings.max_tokens))?Math.max(1,Math.min(512,Math.trunc(Number(settings.max_tokens)))):180,
        },
      });
      if(result?.ok!==true)throw error(clean(result?.code,180)||'COMPANION_LOCAL_AI_FAILED');
      const text=clean(result?.text,32000);
      if(!text)throw error('COMPANION_LOCAL_AI_EMPTY_RESPONSE',502);
      return{
        text,
        provenance:{
          provider:'local-companion-ai',
          model:clean(result?.model,240)||selectedModel||'auto-local',
          transport:'paired-windows-companion',
          backend:clean(result?.backend,120)||'local-ai',
          performance:normalizeOllamaPerformanceEvidence(result?.inference_metrics),
        },
      };
    },
  });
}
