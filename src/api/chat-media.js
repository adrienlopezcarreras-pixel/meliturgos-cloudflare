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
    const artifact=result.artifact;
    const generated=artifact?.stored===true && artifact?.stored_encrypted===true && artifact?.private===true && /^generated\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.[a-z0-9]{1,12}\.enc$/.test(artifact.key||'')
      ? [{...artifact,url:'/api/media/generated?key='+encodeURIComponent(artifact.key)}] : [];
    for(const item of [...generated,...(Array.isArray(result.media)?result.media:[]),...(Array.isArray(result.images)?result.images:[]),...(Array.isArray(result.attachments)?result.attachments:[]),...(Array.isArray(result.outputs)?result.outputs:[]),...(Array.isArray(result.artifacts)?result.artifacts:[]),...(/^media\./.test(String(row.capability))&&result.url?[result]:[])]) {
      const url=safe(item?.url),mime=String(item?.mime||item?.mime_type||item?.content_type||'').split(';',1)[0].trim().toLowerCase();
      if(!url||mime==='image/svg+xml'||/\.svg(?:$|[?#])/i.test(url)||seen.has(url)||media.length>=12)continue;
      const type=['image','audio','video','document'].includes(item.type)?item.type:mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':'document';
      // MEL-CHAT-02: a generated artifact keeps its private reference (key)
      // across resume; the same artifact is never listed twice.
      const privateKey=item?.private===true&&/^generated\//.test(String(item.key||''))?String(item.key):null;
      if(privateKey&&seen.has('key:'+privateKey))continue;
      seen.add(url);if(privateKey)seen.add('key:'+privateKey);
      media.push({type,url,mime:mime||null,title:String(item.title||item.name||type).slice(0,180),source_url:safe(item.source_url),attribution:String(item.attribution||'').slice(0,300),render_status:'PENDING_BROWSER',...(privateKey?{private:true,artifact_key:privateKey}:{})});
    }
    for(const source of [...(Array.isArray(result.references)?result.references:[]),...(Array.isArray(result.sources)?result.sources:[]),...(Array.isArray(result.research?.sources)?result.research.sources:[]),...(Array.isArray(result.artifact?.sources)?result.artifact.sources:[])]) {
      const url=safe(source?.url);if(!url||refs.has(url)||references.length>=20)continue;
      refs.add(url);references.push({url,title:String(source.title||url).slice(0,180)});
    }
  }
  return {media,references};
}
