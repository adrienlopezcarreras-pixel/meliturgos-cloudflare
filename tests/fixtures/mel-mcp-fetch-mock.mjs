// Test-only preload: intercept MEL status without any external network traffic.
globalThis.fetch=async (url,options)=>{
 if(String(url)!=='https://mel.example.test/api/computer/v1/status?computer_id=win-1')throw Error('WRONG_URL');
 if(options.headers.authorization!=='Bearer local-fixture-secret')throw Error('MISSING_AUTH');
 if(options.redirect!=='error')throw Error('REDIRECT_NOT_DISABLED');
 return Response.json({ok:true,selected_id:'win-1',devices:[{
  id:'win-1',name:'MEL Windows',platform:'windows',online:true,halted:false,
  last_seen_at:1720000000000,metadata:{remote_access_enabled:true,token:'DO_NOT_EXPOSE',hostname:'SECRET_HOST'}
 }],commands:[{id:'cmd-1',status:'SUCCEEDED',created_at:1720000000000,
 finished_at:1720000001000,error_code:null,result:{stdout:'DO_NOT_EXPOSE'},plan_json:'DO_NOT_EXPOSE'}]});
};
