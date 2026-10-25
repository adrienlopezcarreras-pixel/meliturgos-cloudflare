import { validateUrl } from '../devices/web-capability.js';
import { inferCurrentFactVerificationPolicy } from '../api/current-fact-reliability.js';
import { inferChatMediaCapability } from '../api/chat-media-intent.js';

function publicHttps(value) {
  const checked=validateUrl(String(value || ''));
  if(!checked.valid || checked.url.protocol!=='https:' || checked.url.username || checked.url.password) return null;
  return checked.url.href.replace(/\(/g,'%28').replace(/\)/g,'%29');
}

export function normalizeImageResults(rows, limit=3) {
  const seen=new Set(),images=[];
  for(const row of Array.isArray(rows)?rows:[]) {
    const url=publicHttps(row?.url),sourceUrl=publicHttps(row?.source_url);
    if(!url||!sourceUrl||/\.svg(?:$|[?#])/i.test(url)||seen.has(url))continue;
    if(row?.mime&&!/^image\/(?:jpeg|png|webp|gif|avif)$/.test(row.mime))continue;
    seen.add(url);
    images.push({type:'image',url,source_url:sourceUrl,title:String(row.title||'Photo').replace(/<[^>]*>/g,'').slice(0,180),
      attribution:String(row.attribution||'').replace(/<[^>]*>/g,'').slice(0,300),render_status:'PENDING_BROWSER'});
    if(images.length>=Math.min(6,Math.max(1,limit)))break;
  }
  return images;
}

// Uses the existing safe/rate-limited InternetService. Public image retrieval
// is separate from generation, and never guesses a mutable officeholder.
export async function searchImages(service,{query,max_images=3}={}) {
  const limit=Math.min(6,Math.max(1,Number(max_images)||3));
  const policy=inferCurrentFactVerificationPolicy(query);
  if(policy?.strict) {
    const result=await service.research(query,policy.preferred_domains,2,policy.official_seed_urls);
    const images=normalizeImageResults(result.sources.map(source=>({url:source.image_url,source_url:source.url,title:source.title})),limit);
    return {...result,images,media:images,references:result.sources.map(source=>({url:source.url,title:source.title})),
      code:images.length?null:'IMAGE_SEARCH_EMPTY',provider:'official-source'};
  }
  return searchPublicMedia(service,{query,type:'image',max_results:limit});
}

// All three public-media searches share URL validation, provenance, rate
// limiting and the same free Commons API; no paid provider fallback.
export async function searchPublicMedia(service,{query,type,max_results=3}={}) {
  if(!['image','audio','video'].includes(type))throw Object.assign(new Error('MEDIA_TYPE_INVALID'),{code:'MEDIA_TYPE_INVALID'});
  const limit=Math.min(6,Math.max(1,Number(max_results)||3));
  const prefix=type==='image'?'IMAGE':'MEDIA';
  const request=inferChatMediaCapability(query);
  const subject=String(['web.images.search','web.media.search'].includes(request?.id)?request.input.query:query||'').trim();
  if(!subject)throw Object.assign(new Error(prefix+'_QUERY_REQUIRED'),{code:prefix+'_QUERY_REQUIRED'});
  const endpoint=new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrnamespace:'6',gsrsearch:subject+' filetype:'+({image:'bitmap',audio:'audio',video:'video'}[type]),gsrlimit:String(limit),prop:'imageinfo',iiprop:'url|mime|extmetadata',...(type==='image'?{iiurlwidth:'960'}:{})}).toString();
  let page,data;
  try {page=await service.fetchPage(endpoint.href);data=JSON.parse(page.content);}
  catch(error){const code=prefix+(/timeout|timed out|abort/i.test(String(error?.message))?'_PROVIDER_TIMEOUT':'_PROVIDER_FAILED');throw Object.assign(new Error(code),{code});}
  if(data?.error||!data||typeof data!=='object')throw Object.assign(new Error(prefix+'_PROVIDER_RESPONSE_INVALID'),{code:prefix+'_PROVIDER_RESPONSE_INVALID'});
  const rows=Object.values(data?.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).map(item=>{
    const info=item.imageinfo?.[0]||{};
    return {url:type==='image'?(info.thumburl||info.url):info.url,source_url:info.descriptionurl,title:item.title,mime:info.mime,
      attribution:info.extmetadata?.Artist?.value};
  });
  const media=type==='image'?normalizeImageResults(rows,limit):rows.filter(row=>publicHttps(row.url)&&publicHttps(row.source_url)&&new RegExp('^'+type+'/(?:ogg|webm|mpeg|mp4|wav|x-wav|flac)$').test(row.mime)).map(row=>({...row,type,url:publicHttps(row.url),source_url:publicHttps(row.source_url),title:String(row.title||type).replace(/<[^>]*>/g,'').slice(0,180),attribution:String(row.attribution||'').replace(/<[^>]*>/g,'').slice(0,300),render_status:'PENDING_BROWSER'})).filter((row,index,all)=>all.findIndex(item=>item.url===row.url)===index).slice(0,limit);
  const sources=media.map(item=>({url:item.source_url,title:item.title,...(type==='image'?{image_url:item.url}:{}),source_kind:'MEDIA_PROVIDER',provenance:{source_id:page.source_id,fetched_at:page.timestamp}}));
  return {query,...(type==='image'?{images:media}:{}),media,sources,references:sources.map(({url,title})=>({url,title})),provider:'wikimedia-commons',zero_added_cost:true,code:media.length?null:prefix+'_SEARCH_EMPTY'};
}
