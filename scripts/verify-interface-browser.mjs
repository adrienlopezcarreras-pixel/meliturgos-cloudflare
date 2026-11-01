// Local browser acceptance against the production entrypoint. No production
// identity, provider or device is simulated as a successful integration.
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker from '../src/visual-final-entry.js';

const output=process.env.MEL_UI_AUDIT_OUTPUT || '/tmp/mel-interface-browser-proof';
await mkdir(output,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'mel-ui-audit-'));
const env={MELITURGOS_USER:'local-audit',MELITURGOS_PASSWORD:'local-audit-fixture',ASSETS:{async fetch(request){
 const path=new URL(request.url).pathname;
 if(!/^\/assets\/[a-zA-Z0-9/_\-.]+$/.test(path)||path.split('/').includes('..'))return new Response('NOT_FOUND',{status:404});
 try{const bytes=await readFile(new URL('../dist'+path,import.meta.url));return new Response(bytes,{headers:{'content-type':path.endsWith('.webp')?'image/webp':path.endsWith('.png')?'image/png':'application/octet-stream'}});}catch{return new Response('NOT_FOUND',{status:404});}
}}};
const requests=[],errors=[],matrix=[],inventories=[];
let browser,server,ws;
const record=(page,element,action,expected,obtained,status,proof)=>matrix.push({page,element,action,expected,obtained,status,proof});
try{
 server=createServer(async(req,res)=>{
  try{
   const bytes=[];for await(const chunk of req)bytes.push(chunk);
   const body=Buffer.concat(bytes),url='http://127.0.0.1:'+server.address().port+req.url;
   const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}:{})});
   const result=await worker.fetch(request,env,{waitUntil(p){p.catch(()=>{});}});
   requests.push({method:req.method,path:new URL(url).pathname,status:result.status});
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch(error){requests.push({method:req.method,path:req.url,status:500,error:String(error.code||error.name)});res.writeHead(500);res.end('LOCAL_AUDIT_REQUEST_FAILED');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=spawn(process.env.MEL_TEST_BROWSER_PATH||'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--disable-background-networking','--disable-component-update','--remote-debugging-port=0','--user-data-dir='+join(directory,'profile'),'about:blank'],{stdio:['ignore','ignore','pipe']});
 browser.stderr.resume();
 let port;const started=Date.now();
 while(!port&&Date.now()-started<30000){try{port=Number((await readFile(join(directory,'profile','DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}if(!port)await new Promise(r=>setTimeout(r,100));}
 if(!port)throw new Error('CHROMIUM_START_TIMEOUT');
 const page=await(await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let serial=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r)},reject:e=>{clearTimeout(timeout);reject(e)}});ws.send(JSON.stringify({id,method,params}));});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Fetch.authRequired')send('Fetch.continueWithAuth',{requestId:m.params.requestId,authChallengeResponse:{response:'ProvideCredentials',username:env.MELITURGOS_USER,password:env.MELITURGOS_PASSWORD}}).catch(()=>{});else if(m.method==='Fetch.requestPaused'){const u=new URL(m.params.request.url);if(u.hostname==='127.0.0.1')send('Fetch.continueRequest',{requestId:m.params.requestId}).catch(()=>{});else send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{});}else if(m.method==='Runtime.exceptionThrown')errors.push({page:currentPage,text:m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text});});
 let currentPage='';
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const pointerClick=async selector=>{
  const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`);
  if(!point)return false;
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});return true;
 };

 await send('Runtime.enable');await send('Page.enable');await send('Fetch.enable',{handleAuthRequests:true});
 for(const path of ['/','/professor','/revenus','/veille','/shardvault','/about','/privacy','/fides','/public/wordpress-chat']){
  currentPage=path;await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+path});
  for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete"'))break;await pause(50);}
  await pause(350);
  const snapshot=await evaluate(`(()=>({title:document.title,bodyLength:document.body.textContent.trim().length,heading:document.querySelector('h1,h2')?.textContent,controls:[...document.querySelectorAll('button,a[href],input,textarea,select,[role="button"]')].map((e,i)=>({index:i,id:e.id,tag:e.tagName,label:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||e.name||'').trim().slice(0,160),type:e.type||null,href:e.getAttribute('href'),view:e.dataset.view||null,panel:e.closest('[data-panel]')?.dataset.panel||null,disabled:e.disabled===true,visible:!!e.getClientRects().length,accessibleName:!!(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.textContent?.trim()||e.labels?.length||e.title)}))}))()`);
  if(path==='/revenus'){
   const masked=await evaluate(`['api_key','app_password'].every(name=>document.querySelector('input[name="'+name+'"]').type==='password')`);
   record(path,'provider credentials','inspect browser input types','API key and app password masked',masked,masked?'PASS':'FAIL','browser-results.json');
  }
  inventories.push({page:path,...snapshot});
  for(const c of snapshot.controls.filter(c=>!c.accessibleName&&['INPUT','SELECT','TEXTAREA','BUTTON'].includes(c.tag)))record(path,c.id||c.tag+'['+c.index+']','accessible name','Programmatic label available','Missing accessible name','FAIL','inventory.json');record(path,'page','navigate','HTML rendered by production entrypoint',snapshot.heading||snapshot.title,snapshot.title&&snapshot.bodyLength>30&&requests.some(r=>r.path===path&&r.method==='GET'&&r.status===200)?'PASS':'FAIL','inventory.json');
  for(const c of snapshot.controls)record(path,c.id||c.tag+'['+c.index+'] '+c.label,'inventory / functional execution','Function and durable outcome verified',c.disabled?'Disabled; live prerequisites unverified':'Requires functional scenario and live prerequisites','BLOCKED','inventory.json');
  if(path==='/'||path==='/professor'){
   const attachmentSelector=path==='/'?'#attachments':'#chatAttachments';
   const fixture=join(directory,'attachment-reselect.txt');await writeFile(fixture,'Local text fixture for file-picker reselection.');
   const dom=await send('DOM.getDocument');const inputNode=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:path==='/'?'#fileInput':'#chatFileInput'});
   const uploads=()=>requests.filter(r=>r.path==='/api/files/upload'&&r.method==='POST').length;
   await send('DOM.setFileInputFiles',{nodeId:inputNode.nodeId,files:[fixture]});
   for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('${attachmentSelector} button')`))break;await pause(50);}
   const staged=await evaluate(`document.querySelector('${attachmentSelector}')?.textContent.includes('attachment-reselect.txt')`);
   record(path,'attachment:first-selection','real Chromium file selection','Text file uploaded and staged',staged,staged?'PASS':'FAIL','browser-results.json');
   await pointerClick(attachmentSelector+' button');const initial=uploads();
   await send('DOM.setFileInputFiles',{nodeId:inputNode.nodeId,files:[fixture]});await pause(700);
   const reselected=await evaluate(`document.querySelector('${attachmentSelector}')?.textContent.includes('attachment-reselect.txt')`);
   record(path,'attachment:same-file-reselection','remove then select same local file again','Second upload and staged attachment',JSON.stringify({staged:reselected,requests:uploads()-initial}),reselected&&uploads()>initial?'PASS':'FAIL','browser-results.json');
  }
  if(path==='/'){
   const noObjective=await evaluate("!document.querySelector('#objectivePanel')");
   record(path,'objective:normal-isolation','inspect Normal UI','Objective panel entirely absent',noObjective,noObjective?'PASS':'FAIL','browser-results.json');
  }
  if(path==='/professor'){
   const state=await evaluate("(()=>{const p=document.querySelector('#objectivePanel');const r=p?.getBoundingClientRect();return {fixed:getComputedStyle(p).position==='fixed',visible:!!r?.width&&!!r?.height,right:r?.right,bottom:r?.bottom,viewWidth:innerWidth,viewHeight:innerHeight}})()");
   record(path,'objective:floating','computed style and layout','Fixed and inside viewport',JSON.stringify(state),state.fixed&&state.visible&&state.right<=state.viewWidth+1&&state.bottom<=state.viewHeight+1?'PASS':'FAIL','browser-results.json');
   const start=await evaluate("(()=>{const r=document.querySelector('#objectiveDrag').getBoundingClientRect();const p=document.querySelector('#objectivePanel').getBoundingClientRect();return {x:r.left+30,y:r.top+r.height/2,left:p.left,top:p.top}})()");
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x,y:start.y});
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:start.x,y:start.y,button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x-60,y:start.y+35,button:'left',buttons:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x-60,y:start.y+35,button:'left',clickCount:1});
   const moved=await evaluate("(()=>{const r=document.querySelector('#objectivePanel').getBoundingClientRect();return {left:r.left,top:r.top}})()");
   record(path,'objective:drag','real Chromium pointer drag','Panel moved without repositioning chat',JSON.stringify({start,moved}),Math.abs(moved.left-(start.left-60))<3&&Math.abs(moved.top-(start.top+35))<3?'PASS':'FAIL','browser-results.json');
   const collapsedClick=await pointerClick('#objectiveCollapse');
   const collapsed=await evaluate("document.querySelector('#objectivePanel').classList.contains('is-collapsed')");
   record(path,'objective:collapse','real pointer click','Objective reduced',collapsed,collapsedClick&&collapsed?'PASS':'FAIL','browser-results.json');
   await pointerClick('#objectiveCollapse');
   await pointerClick('#objectiveHide');
   const hidden=await evaluate("document.querySelector('#objectivePanel').hidden&&!document.querySelector('#objectiveShow').hidden");
   record(path,'objective:hide','real pointer click','Objective hidden and restore available',hidden,hidden?'PASS':'FAIL','browser-results.json');
   const restoredClick=await pointerClick('#objectiveShow');
   const reopened=await evaluate("!document.querySelector('#objectivePanel').hidden");
   record(path,'objective:restore','real pointer click','Objective shown again',reopened,restoredClick&&reopened?'PASS':'FAIL','browser-results.json');
   await send('Page.reload');
   for(let i=0;i<100;i++){if(await evaluate('document.readyState===\"complete\"'))break;await pause(50);}await pause(100);
   const persisted=await evaluate("(()=>{const p=document.querySelector('#objectivePanel');const r=p.getBoundingClientRect();return !p.hidden&&Math.abs(r.left-parseFloat(localStorage.getItem('mel-professor-objective-float-v1')?JSON.parse(localStorage.getItem('mel-professor-objective-float-v1')).left:-100))<3})()");
   record(path,'objective:persistence','reload after drag','Stored position restored',persisted,persisted?'PASS':'FAIL','browser-results.json');
  }
  if(path==='/professor'){
   for(const view of await evaluate('[...document.querySelectorAll("#nav [data-view]")].map(e=>e.dataset.view)')){
    let clicked=await pointerClick('#nav [data-view="'+view+'"]');
    if(!clicked){await pointerClick('#mobileMoreNav');clicked=await pointerClick('#mobileMoreMenu [data-jump="'+view+'"]');}
    const result=await evaluate(`({active:document.querySelector('.view.active')?.dataset.panel,title:document.querySelector('#viewTitle')?.textContent})`);
    record(path,'navigation:'+view,'visible browser pointer click','Requested section visible',result.active,clicked&&result.active===view?'PASS':'FAIL','browser-results.json');
   }
   await pointerClick('#nav [data-view="chat"]');await pointerClick('#melRoleCode');await pause(100);
   const loraClicked=await pointerClick('#chatLoraMode');
   const loraSelected=await evaluate("document.querySelector('#chatLoraMode').value==='uncensored'&&document.querySelector('#chatLoraMode').getAttribute('aria-pressed')==='true'");
   record(path,'chat:lora-mode-pointer','real pointer click on bottom chat button','Explicit required-LoRA mode selected',loraSelected,loraClicked&&loraSelected?'PASS':'FAIL','browser-results.json');
   const beforeLoraRequests=requests.filter(r=>r.path==='/api/chat'&&r.method==='POST').length;
   await evaluate("document.querySelector('#chatInput').value='Bonjour, ceci est un test local du mode Venice sans clé OpenRouter.'");
   await pointerClick('#chatSend');
   for(let i=0;i<100;i++){if(requests.filter(r=>r.path==='/api/chat'&&r.method==='POST').length>beforeLoraRequests)break;await pause(50);}
   await pause(200);
   const loraRequests=requests.filter(r=>r.path==='/api/chat'&&r.method==='POST').slice(beforeLoraRequests);
   const rejectedLora=await evaluate("/VENICE_KEY_MISSING|OPENROUTER_API_KEY|OpenRouter/i.test(document.querySelector('#chatlog').textContent)");
   record(path,'chat:venice-no-key','submit through real browser and production entrypoint without database','NDJSON transport with a visible Venice configuration error, exactly one request and no replacement',JSON.stringify({requests:loraRequests.map(r=>r.status),visibleError:rejectedLora}),loraRequests.length===1&&loraRequests[0].status===200&&rejectedLora?'PASS':'FAIL','browser-results.json');
   await evaluate("document.querySelector('#chatLoraMode').focus()");
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   const loraDisabled=await evaluate("document.querySelector('#chatLoraMode').value==='automatic'&&document.querySelector('#chatLoraMode').getAttribute('aria-pressed')==='false'");
   record(path,'chat:lora-keyboard','Enter on focused mode button','Automatic mode restored without submitting another message',loraDisabled,loraDisabled?'PASS':'FAIL','browser-results.json');
   const compact=await evaluate("document.querySelector('#melCodeLivePanel').classList.contains('is-collapsed')&&document.querySelector('#melCodeLiveCollapse').getAttribute('aria-expanded')==='false'");
   record(path,'activity:compact-default','open approved Code surface','Starts compact until explicit expansion',compact,compact?'PASS':'FAIL','browser-results.json');
   await pointerClick('#melCodeLiveCollapse');
   for(const action of ['collapse','reopen']){const result=await evaluate(`(()=>{document.querySelector('#melCodeLiveCollapse').click();return {collapsed:document.querySelector('#melCodeLivePanel').classList.contains('is-collapsed'),expanded:document.querySelector('#melCodeLiveCollapse').getAttribute('aria-expanded')}})()`);const closed=action==='collapse';record(path,'activity:'+action,'click','Collapsed state and aria-expanded agree',JSON.stringify(result),result.collapsed===closed&&result.expanded===String(!closed)?'PASS':'FAIL','browser-results.json');}
   const priorActivityCount=await evaluate("document.querySelector('#melCodeLiveEvents').children.length");
   await evaluate(`for(let i=0;i<40;i++)melCodeLiveRecord({id:'local-browser-'+i,label:'Local fixture event '+i+': '+'Local fixture stress details '.repeat(80),status:'done',source:'local-fixture'})`);await pause(1000);
   const scroll=await evaluate(`(()=>{const p=document.querySelector('#melCodeLivePanel');return {bottom:Math.abs(p.scrollHeight-p.clientHeight-p.scrollTop)<3,overflow:p.scrollHeight>p.clientHeight}})()`);
   record(path,'activity:latest','append clearly-labelled local fixture events','Latest event reachable at bottom',JSON.stringify(scroll),scroll.bottom&&scroll.overflow?'PASS':'FAIL','browser-results.json');
   const recent=await evaluate("(()=>{const h=document.querySelector('#melCodeLiveEvents');return {count:h.children.length,last:h.lastElementChild?.textContent.includes('Local fixture event 39')}})()");
   record(path,'activity:history-kept','append labelled fixture events','Whole history kept (scrollable), newest retained',JSON.stringify(recent),recent.count===priorActivityCount+40&&recent.last?'PASS':'FAIL','browser-results.json');
   const control=await evaluate(`(()=>{const e=document.querySelector('#melCodeLiveCollapse'),r=e.getBoundingClientRect();return {visible:r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e,x:r.x+r.width/2,y:r.y+r.height/2}})()`);
   record(path,'activity:collapse-after-growth','hit-test visible collapse button after new events','Header button visible and clickable at latest entry',JSON.stringify(control),control.visible?'PASS':'FAIL','browser-results.json');
   if(control.visible){await send('Input.dispatchMouseEvent',{type:'mousePressed',x:control.x,y:control.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:control.x,y:control.y,button:'left',clickCount:1});const closed=await evaluate("document.querySelector('#melCodeLivePanel').classList.contains('is-collapsed')");record(path,'activity:pointer-collapse','real browser pointer click','Panel collapsed',closed,closed?'PASS':'FAIL','browser-results.json');
    await evaluate("document.querySelector('#melCodeLiveCollapse').focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    const reopened=await evaluate("!document.querySelector('#melCodeLivePanel').classList.contains('is-collapsed')");
    record(path,'activity:keyboard-reopen','Enter on focused button','Panel reopened',reopened,reopened?'PASS':'FAIL','browser-results.json');
    await send('Page.reload');
    for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete"'))break;await pause(50);}await pause(100);
    const restored=await evaluate("document.querySelector('#melCodeLivePanel').classList.contains('is-collapsed')&&document.querySelector('#melCodeLiveCollapse').getAttribute('aria-expanded')==='false'");
    record(path,'activity:reload-collapse','reload after explicit expansion','Approved compact default restored',restored,restored?'PASS':'FAIL','browser-results.json');
    if(restored)await evaluate("document.querySelector('#melCodeLiveCollapse').click()");

   }

  }
  for(const width of [390,768]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await pause(100);const layout=await evaluate('({width:innerWidth,document:document.documentElement.scrollWidth})');record(path,'viewport:'+width,'resize','No page-wide horizontal overflow',JSON.stringify(layout),layout.document<=width+1?'PASS':'FAIL','browser-results.json');}
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,(path==='/'?'normal':path.slice(1).replaceAll('/','-'))+'.png'),Buffer.from(shot.data,'base64'));
 }
 for(const error of errors)record(error.page,'JavaScript runtime','load / interact','No uncaught exceptions',error.text,'FAIL','errors.json');
 for(const feature of ['MAX persistence after release','Council real models','Mentor code generation','WORK delivery and real revenue','Windows keyboard/mouse/screen','Android and MINI hardware','Memory durable archive/import','LoRA real training','OAuth authorized account','Production SHA and D1'])record('live',feature,'live end-to-end acceptance','Actual authorized integration/device outcome','Local audit has no production identity, durable database, live provider or hardware; separate authorized live acceptance required','BLOCKED','live-access');
 await writeFile(join(output,'inventory.json'),JSON.stringify(inventories,null,2));await writeFile(join(output,'errors.json'),JSON.stringify(errors,null,2));await writeFile(join(output,'requests.json'),JSON.stringify(requests,null,2));
 const result={schema:'mel.interface-browser-audit/v1',production:false,entrypoint:'src/visual-final-entry.js',source_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_tracked_dirty:Boolean(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()),provider_fixtures:false,database_available:false,external_network_blocked:true,matrix};
 await writeFile(join(output,'browser-results.json'),JSON.stringify(result,null,2));
 const cell=v=>String(v??'').replaceAll('|','\\|').replaceAll('\n',' ');
 await writeFile(join(output,'matrix.md'),'# Local Chromium interface audit\n\nLocal UI only; blocked integrations are never certified.\n\nPage | Élément | Action | Résultat attendu | Résultat obtenu | PASS/FAIL/BLOCKED | Preuve\n--- | --- | --- | --- | --- | --- | ---\n'+matrix.map(r=>[r.page,r.element,r.action,r.expected,r.obtained,r.status,r.proof].map(cell).join(' | ')).join('\n')+'\n');
 console.log(JSON.stringify({output,controls:inventories.reduce((n,p)=>n+p.controls.length,0),passed:matrix.filter(r=>r.status==='PASS').length,failed:matrix.filter(r=>r.status==='FAIL').length,blocked:matrix.filter(r=>r.status==='BLOCKED').length,errors:errors.length}));
 if(matrix.some(r=>r.status==='FAIL'))process.exitCode=1;
}finally{
 ws?.close();browser?.kill('SIGTERM');if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}

process.exit(process.exitCode||0);
