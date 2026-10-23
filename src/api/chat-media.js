import {validateUrl} from '../devices/web-capability.js';

export function collectChatMedia(toolResults=[],origin='https://meliturgos.adrien-lopezcarreras.workers.dev') {
  const safe=value=>{
    try {
      const raw=String(value||'').trim();if(!raw)return null;const url=new URL(raw,origin);
      if(url.username||url.password)return null;
      if(raw.startsWith('/')&&!raw.startsWith('//')&&url.origin===origin&&/^\/api\/(?:media|files|attachments|computer\/v1\/screenshot)(?:\/|$)/.test(url.pathname))return url.href;
      return url.protocol==='https:'&&validateUrl(url.href).valid?url.href:null;
    } catch {return null;}
  };
  const media=[],references=[],seen=new Set(),refs=new Set();
  for(const row of toolResults.filter(row=>row?.status==='SUCCEEDED')) {
    const result=row.result||{};
    if(result.ok===false||['QUEUED','ACCEPTED','PENDING','RUNNING','PROCESSING'].includes(String(result.status||'').toUpperCase()))continue;
    for(const item of [...(Array.isArray(result.media)?result.media:[]),...(Array.isArray(result.images)?result.images:[]),...(Array.isArray(result.attachments)?result.attachments:[]),...(Array.isArray(result.outputs)?result.outputs:[]),...(Array.isArray(result.artifacts)?result.artifacts:[]),...(/^media\./.test(String(row.capability))&&result.url?[result]:[])]) {
      const url=safe(item?.url),mime=String(item?.mime||item?.mime_type||item?.content_type||'').toLowerCase();
      if(!url||mime==='image/svg+xml'||/\.svg(?:$|[?#])/i.test(url)||seen.has(url)||media.length>=12)continue;
      const type=['image','audio','video','document'].includes(item.type)?item.type:mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':'document';
      seen.add(url);media.push({type,url,mime:mime||null,title:String(item.title||item.name||type).slice(0,180),source_url:safe(item.source_url),render_status:'PENDING_BROWSER'});
    }
    for(const source of [...(Array.isArray(result.references)?result.references:[]),...(Array.isArray(result.sources)?result.sources:[]),...(Array.isArray(result.research?.sources)?result.research.sources:[]),...(Array.isArray(result.artifact?.sources)?result.artifact.sources:[])]) {
      const url=safe(source?.url);if(!url||refs.has(url)||references.length>=20)continue;
      refs.add(url);references.push({url,title:String(source.title||url).slice(0,180)});
    }
  }
  return {media,references};
}
