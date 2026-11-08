// Raw source is emitted into /professor; keep it independent of bundler helpers.
export const ACTION_RECEIPT_RUNTIME = String.raw`
const actionRequests=new Map();
function showActionReceipt(url,receipt){
  let node=document.getElementById('apiActionReceipt');
  if(!node){
    const parent=document.querySelector('.main');if(!parent)return;
    node=document.createElement('p');node.id='apiActionReceipt';
    node.setAttribute('role','status');node.setAttribute('aria-live','polite');
    parent.prepend(node);
  }
  const safe=value=>String(value??'').replace(/[\r\n]/g,' ').slice(0,120);
  if(!receipt){node.textContent='Action en cours : '+safe(url);return;}
  if(receipt.localError){node.textContent='Réponse non confirmée : '+safe(receipt.localError);return;}
  const data=receipt.data||{},reference=data.receipt?.id||data.request_id||data.job_id||data.run_id||data.id||data.job?.id;
  node.textContent='Reçu API HTTP '+receipt.status+' · '+safe(data.code||data.error||data.status||(data.ok===false?'REFUSED':'RESPONSE_RECEIVED'))+' · '+(reference?'référence '+safe(reference):'référence non fournie');
}
async function fetchActionWithReceipt(url,opts,timeout){
  // Ensure that refusal responses (e.g., 403, 503) are displayed without a reference ID.
  if(!/^\/api\/(work\/|memory\/|gen2\/(shardvault|augmentio|council|connections|oauth|migration)\/|learning\/lora\/)/.test(url)||
      (opts.body!==undefined&&typeof opts.body!=='string'))return fetchJsonWithTimeout(url,opts,timeout);
  // Hash instead of retaining JSON keys containing connection credentials.
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(opts.body||''));
  const key=String(opts.method||'POST').toUpperCase()+' '+url+' '+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const previous=actionRequests.get(key);
  if(previous){showActionReceipt(url,previous.receipt);return previous.task;}
  const entry={receipt:null,task:null};
  actionRequests.set(key,entry);showActionReceipt(url,null);
  entry.task=fetchJsonWithTimeout(url,opts,timeout,receipt=>{
    entry.receipt=receipt;showActionReceipt(url,receipt);
  }).catch(error=>{
    if(!entry.receipt){entry.receipt={localError:error.message};showActionReceipt(url,entry.receipt);}
    throw error;
  }).finally(()=>{
    // Retain the same acknowledgement briefly, including an ambiguous timeout.
    setTimeout(()=>{if(actionRequests.get(key)===entry)actionRequests.delete(key);},1500);
  });
  return entry.task;
}
`;
