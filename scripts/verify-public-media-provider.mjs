// Public, read-only provider check from the CI network. No AI calls, owner
// credentials, production Worker, D1 or R2 writes. Empty is not success.
import InternetService from '../src/services/internet-service.js';
import {searchPublicMedia} from '../src/search/image-search.js';

const checks=[];
for(const [type,query] of [['image','cat'],['audio','rain'],['video','ocean']]){
 const http=[];
 const service=new InternetService({MEL_WEB_FETCH:async(...args)=>{
  const response=await fetch(...args);http.push({origin:new URL(args[0]).origin,status:response.status});return response;
 }});
 try{
  const result=await searchPublicMedia(service,{query,type,max_results:1});
  checks.push({type,ok:result.media.length>0,code:result.code||null,provider:result.provider,count:result.media.length,http});
 }catch(error){checks.push({type,ok:false,code:/^(?:IMAGE|MEDIA)_[A-Z_]+$/.test(error.code||'')?error.code:'PROVIDER_CHECK_FAILED',http});}
}
const receipt={schema:'mel.public-media-provider-proof/v1',observed_at:new Date().toISOString(),production:false,public_network:true,storage_written:false,ok:checks.every(check=>check.ok),checks};
console.log(JSON.stringify(receipt,null,2));
console.error('::notice title=MEL public media provider::'+JSON.stringify(receipt));
if(!receipt.ok)process.exitCode=1;
