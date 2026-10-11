function clean(v,max=4000){return String(v??'').trim().slice(0,max);}
function error(code,status=503){const e=new Error(code);e.code=code;e.status=status;return e;}

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
        },
      };
    },
  });
}
