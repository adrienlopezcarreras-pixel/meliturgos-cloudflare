globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,devices:[{name:'é'.repeat(600000)}]}),{status:200,headers:{'content-type':'application/json'}});
