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
    if (!/^(?:image\/(?:png|jpeg|webp|gif|avif)|audio\/(?:wav|mpeg|ogg|mp4|webm|flac)|video\/(?:webm|mp4|ogg))$/.test(artifact.mime)) {
      return Response.json({ok:false,code:'MEDIA_PLAYBACK_TYPE_UNSUPPORTED'},{status:415});
    }
    const headers={'content-type':artifact.mime,'content-length':String(artifact.size),'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'content-disposition':'inline'};
    return new Response(request.method==='HEAD'?null:artifact.bytes,{headers});
  } catch(error) {
    return Response.json({ok:false,code:/^MEDIA_[A-Z_]+$/.test(error.code||'')?error.code:'MEDIA_PLAYBACK_FAILED'},{status:[400,404,409,410,503].includes(error.status)?error.status:502,headers:{'cache-control':'no-store'}});
  }
}
