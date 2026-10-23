import { validateUrl } from '../devices/web-capability.js';
import { inferCurrentFactVerificationPolicy } from '../api/current-fact-reliability.js';

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
export async function searchImages(service,{query,max_images=3,seed_urls=null,domains=null}={}) {
  const limit=Math.min(6,Math.max(1,Number(max_images)||3));
  const policy=inferCurrentFactVerificationPolicy(query);
  if(policy?.strict) {
    const result=await service.research(query,policy.preferred_domains,2,policy.official_seed_urls);
    const images=normalizeImageResults(result.sources.map(source=>({url:source.image_url,source_url:source.url,title:source.title})),limit);
    return {...result,images,media:images,references:result.sources.map(source=>({url:source.url,title:source.title})),
      code:images.length?null:'IMAGE_SEARCH_EMPTY',provider:'official-source'};
  }
  const subject=String(query||'').replace(/\b(?:montre[- ]?moi|montre|moi|affiche|cherche|recherche|trouve|donne|une?|des|les|de|du|trois|deux|quatre|photos?|images?|portraits?)\b/gi,' ').replace(/\s+/g,' ').trim();
  if(!subject)throw Object.assign(new Error('IMAGE_QUERY_REQUIRED'),{code:'IMAGE_QUERY_REQUIRED'});
  const endpoint=new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrnamespace:'6',gsrsearch:subject+' filetype:bitmap',gsrlimit:String(limit),prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'960'}).toString();
  let page,data;
  try {page=await service.fetchPage(endpoint.href);data=JSON.parse(page.content);}
  catch(error){const code=/timeout|timed out|abort/i.test(String(error?.message))?'IMAGE_PROVIDER_TIMEOUT':'IMAGE_PROVIDER_FAILED';throw Object.assign(new Error(code),{code});}
  if(data?.error||!data||typeof data!=='object')throw Object.assign(new Error('IMAGE_PROVIDER_RESPONSE_INVALID'),{code:'IMAGE_PROVIDER_RESPONSE_INVALID'});
  const rows=Object.values(data?.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).map(item=>{
    const info=item.imageinfo?.[0]||{};
    return {url:info.thumburl||info.url,source_url:info.descriptionurl,title:item.title,mime:info.mime,
      attribution:info.extmetadata?.Artist?.value};
  });
  const images=normalizeImageResults(rows,limit);
  const sources=images.map(image=>({url:image.source_url,title:image.title,image_url:image.url,source_kind:'IMAGE_PROVIDER',provenance:{source_id:page.source_id,fetched_at:page.timestamp}}));
  return {query,images,media:images,sources,references:sources.map(({url,title})=>({url,title})),provider:'wikimedia-commons',code:images.length?null:'IMAGE_SEARCH_EMPTY'};
}
