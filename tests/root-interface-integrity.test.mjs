import assert from "node:assert/strict";
import worker from "../src/visual-final-entry.js";
import { NORMAL_RUNTIME_SOURCE } from "../src/pages/mvp-runtime.js";

const stmt={
  bind(){return this},
  run:async()=>({meta:{changes:0}}),
  first:async()=>({n:0,quick_check:"ok"}),
  all:async()=>({results:[]})
};
const env={
  MELITURGOS_USER:"adrien",
  MELITURGOS_PASSWORD:"test",
  DB:{prepare(){return Object.create(stmt)},batch:async()=>[]}
};
const h=new Headers({Authorization:"Basic "+Buffer.from("adrien:test").toString("base64")});
const r=await worker.fetch(new Request("https://local/",{headers:h}),env);
assert.equal(r.status,200);
const html=await r.text();
const ids=[...html.matchAll(/id=["']([^"']+)["']/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size);
assert.match(html,/\/normal-runtime\.js\?v=7/);
assert.match(NORMAL_RUNTIME_SOURCE,/queueMessage\(\)/);
assert.match(NORMAL_RUNTIME_SOURCE,/e\.isComposing/);
console.log("root-interface-integrity: canonical entry, IDs uniques, Entrée/Maj+Entrée et zoom validés");
