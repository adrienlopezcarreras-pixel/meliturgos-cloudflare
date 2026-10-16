import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Companion asset and packaged script use the same bounded PNG capture path',async()=>{
 const asset=await readFile(new URL('../assets/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 const packaged=await readFile(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 const api=await readFile(new URL('../src/devices/computer-companion-api.js',import.meta.url),'utf8');
 assert.equal(asset,packaged,'Packaged Companion must include exact same capture code');
 assert.match(api,/bytes\.byteLength>5\*1024\*1024/);
 const start=asset.indexOf('function Capture-PngBytes(');
 const end=asset.indexOf('function Upload-Screenshot(',start);
 assert.ok(start>=0&&end>start);
 const capture=asset.slice(start,end);
 assert.match(capture,/\$maxBytes = 5 \* 1024 \* 1024/);
 assert.match(capture,/if \(\$ms\.Length -le \$maxBytes\) \{ return ,\$ms\.ToArray\(\) \}/);
 assert.match(capture,/\$scale \*= 0\.72/);
 assert.match(capture,/for \(\$attempt = 0; \$attempt -lt 9; \$attempt\+\+\)/);
 assert.match(capture,/InterpolationMode\]::HighQualityBicubic/);
 assert.match(capture,/\$scaledGraphics\.DrawImage\(\$bmp, 0, 0, \$width, \$height\)/);
 assert.match(capture,/SCREENSHOT_SIZE_LIMIT_EXCEEDED/);
 assert.match(capture,/finally \{ \$scaledGraphics\.Dispose\(\) \}/);
 assert.match(capture,/finally \{ \$ms\.Dispose\(\) \}/);
 assert.match(capture,/if \(\$null -ne \$scaled\) \{ \$scaled\.Dispose\(\) \}/);
 assert.match(capture,/finally \{ \$bmp\.Dispose\(\) \}/);
 const request=asset.slice(end,asset.indexOf('function Key-Token(',end));
 assert.match(request,/Capture-PngBytes/);
 assert.match(request,/Invoke-RestMethod -Uri \$uri -Method Post/);
});
