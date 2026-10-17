import test from 'node:test';
import assert from 'node:assert/strict';
import { Script, createContext } from 'node:vm';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

async function mapper(){
 const response=await onRequestGet();
 assert.equal(response.status,200);
 const html=await response.text();
 const a=html.indexOf('function mapComputerScreenClick(img,event,pc){');
 const b=html.indexOf('function renderComputer(d){',a);
 assert.ok(a>=0&&b>a,'mapping function must ship in served HTML');
 const js=html.slice(a,b);
 const context=createContext({});
 new Script(js+';this.map=mapComputerScreenClick;', {filename:'screen-click-map.js'}).runInContext(context);
 return {map:context.map,html};
}
function img(bounds,overrides={}){
 const now=Date.now();
 return {
  dataset:{capturePcId:'pc-1',captureCommandId:'captured-id',
   captureBounds:JSON.stringify(bounds),captureFinishedAt:String(now-2000)},
  complete:true,naturalWidth:1600,naturalHeight:900,
  getBoundingClientRect(){return {left:100,top:200,right:900,bottom:650,width:800,height:450}},
  ...overrides
 };
}
const pc={id:'pc-1',halted:false,metadata:{remote_access_enabled:true}};
const geometry={left:-1920,top:-100,width:3840,height:2160};

test('click maps downscaled screenshot onto original virtual desktop with negative offsets',async()=>{
 const {map,html}=await mapper();
 const i=img(geometry);
 const middle=map(i,{clientX:500,clientY:425},pc);
 assert.equal(middle.x,0);
 assert.equal(middle.y,980);
 const topLeft=map(i,{clientX:100,clientY:200},pc);
 assert.equal(topLeft.x,-1920);
 assert.equal(topLeft.y,-100);
 const bottomRight=map(i,{clientX:899.99,clientY:649.99},pc);
 assert.equal(bottomRight.x,1919);
 assert.equal(bottomRight.y,2059);
 assert.ok(html.includes("img.dataset.captureBounds=JSON.stringify({left:Number(bounds.left),top:Number(bounds.top),width:Number(bounds.width),height:Number(bounds.height)})"));
 assert.ok(html.includes("await computerCommand([{action:'cursor.move',x:point.x,y:point.y},{action:'pointer.click'}]);"));
 assert.ok(html.includes("await computerCommand([{action:'screen.capture'}]);"));
 assert.ok(!html.includes("setTimeout(()=>computerCommand([{action:'screen.capture'}])"));
});
test('click fails closed without a loaded recent screenshot, same PC, and owner permission',async()=>{
 const {map}=await mapper();
 const click={clientX:500,clientY:425};
 assert.throws(()=>map(img(geometry),{clientX:1000,clientY:425},pc),/COMPUTER_CLICK_OUTSIDE_CAPTURE/);
 assert.throws(()=>map(img(geometry,{naturalWidth:0}),click,pc),/COMPUTER_CAPTURE_NOT_FRESH/);
 assert.throws(()=>map(img(geometry),click,{...pc,id:'pc-other'}),/COMPUTER_CAPTURE_NOT_FRESH/);
 assert.throws(()=>map(img(geometry),click,{...pc,halted:true}),/COMPUTER_CAPTURE_NOT_FRESH/);
 assert.throws(()=>map(img(geometry),click,{...pc,metadata:{remote_access_enabled:false}}),/COMPUTER_CAPTURE_NOT_FRESH/);
 const expired=img(geometry);expired.dataset.captureFinishedAt=String(Date.now()-61000);
 assert.throws(()=>map(expired,click,pc),/COMPUTER_CAPTURE_NOT_FRESH/);
 const invalid=img({left:0,top:0,width:0,height:1080});
 assert.throws(()=>map(invalid,click,pc),/COMPUTER_CAPTURE_BOUNDS_INVALID/);
});
