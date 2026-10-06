import { maybeHandleAndroidCompanionApi } from "../devices/android-companion-api.js";

function json(value,status=200){
  return new Response(JSON.stringify(value),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store"
    }
  });
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/healthz" && request.method==="GET"){
      return json({ok:true,service:"MEL_MINI_RELAY_V2",protocol:2});
    }
    if(!url.pathname.startsWith("/api/android/v1/mini/")){
      return json({ok:false,code:"MINI_RELAY_ROUTE_ONLY"},404);
    }
    const response=await maybeHandleAndroidCompanionApi(request,env);
    return response || json({ok:false,code:"MINI_RELAY_ROUTE_NOT_FOUND"},404);
  }
};
