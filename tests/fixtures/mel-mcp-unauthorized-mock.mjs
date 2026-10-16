globalThis.fetch=async (_url,options)=>{
 if(options.headers.authorization!=='Bearer rejected-fixture-token')throw Error('UNEXPECTED_AUTH');
 return new Response(JSON.stringify({ok:true,devices:[{id:'fake',online:true}]}),{status:401,headers:{'content-type':'application/json'}});
};
