import { requireAuth } from '../core/security.js';
import { readPrivateArtifactBytes } from '../media/workers-ai-media-capabilities.js';

// Private playback stays on the authenticated origin. No public object URL,
// signed bearer URL, cache, or external request is created.
export async function handleGeneratedMedia(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!/^generated\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.[a-z0-9]{1,12}\.enc$/.test(key)) {
    return Response.json({ok:false,code:'MEDIA_ARTIFACT_KEY_INVALID'},{status:400});
  }
  try {
    const artifact = await readPrivateArtifactBytes(env,key,{expectedOwner:env.MELITURGOS_USER || 'owner'});
    const mime = String(artifact.mime || '').split(';', 1)[0].trim().toLowerCase();
    if (!/^(?:image\/(?:png|jpeg|webp|gif|avif)|audio\/(?:wav|mpeg|ogg|mp4|webm|flac)|video\/(?:webm|mp4|ogg))$/.test(mime)) {
      return Response.json({ok:false,code:'MEDIA_PLAYBACK_TYPE_UNSUPPORTED'},{status:415});
    }
    const headers={'content-type':mime,'content-length':String(artifact.size),'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'content-disposition':'inline','accept-ranges':'bytes'};
    // Authenticate, check ownership/TTL and verify the complete ciphertext
    // before serving any byte range. No partial decryption or public URL.
    const range=request.method==='GET'&&!request.headers.has('if-range')?request.headers.get('range'):null;
    if(range){
      const match=range.match(/^bytes=(\d*)-(\d*)$/);
      let start=0,end=artifact.size-1;
      let valid=Boolean(match&&(match[1]||match[2]));
      if(valid&&match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
      else if(valid){const suffix=Number(match[2]);valid=Number.isSafeInteger(suffix)&&suffix>0;start=Math.max(0,artifact.size-suffix);}
      valid=valid&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<artifact.size&&end>=start;
      if(!valid)return new Response(null,{status:416,headers:{...headers,'content-length':'0','content-range':'bytes */'+artifact.size}});
      const bytes=artifact.bytes.subarray(start,end+1);
      return new Response(bytes,{status:206,headers:{...headers,'content-length':String(bytes.byteLength),'content-range':`bytes ${start}-${end}/${artifact.size}`}});
    }
    return new Response(request.method==='HEAD'?null:artifact.bytes,{headers});
  } catch(error) {
    return Response.json({ok:false,code:/^MEDIA_[A-Z_]+$/.test(error.code||'')?error.code:'MEDIA_PLAYBACK_FAILED'},{status:[400,404,409,410,503].includes(error.status)?error.status:502,headers:{'cache-control':'no-store'}});
  }
}
