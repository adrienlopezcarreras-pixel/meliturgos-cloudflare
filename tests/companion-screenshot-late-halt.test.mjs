import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('screenshot upload rechecks HALT and command status after body reception',async()=>{
 const source=await readFile(new URL('../src/devices/computer-companion-api.js',import.meta.url),'utf8');
 const start=source.indexOf('async function uploadShot(');
 const end=source.indexOf('export async function maybeHandleComputerApi(',start);
 const handler=source.slice(start,end);
 const bodyAt=handler.indexOf('await request.arrayBuffer()');
 const recheckAt=handler.indexOf('SCREENSHOT_AUTH_REVOKED_DURING_UPLOAD');
 const putAt=handler.indexOf('await env.MEDIA_BUCKET.put');
 assert.ok(bodyAt>=0&&recheckAt>bodyAt&&putAt>recheckAt);
 assert.match(handler,/latest\.status!=="RUNNING"/);
 assert.match(handler,/Number\(latest\.halted\)===1/);
 assert.match(handler,/Number\(latestPlan\.expires_at\)<=Date\.now\(\)/);
});
