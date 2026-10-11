import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderNormal } from '../src/pages/mvp-interface-v3.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { onRequestGet as renderFull } from '../src/pages/full-interface-v2.js';
import { onRequestGet as renderWatch } from '../src/pages/watch-interface.js';
import { renderFidesGuestPage } from '../src/pages/fides-guest-page.js';
import { renderPublicWordPressChatPage } from '../src/pages/public-wordpress-chat-page.js';
import { handleShardVaultStatus } from '../src/pages/shardvault-status.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

function allButtons(html){
  return [...String(html).matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
    .map(match=>({attrs:match[1],label:match[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}));
}

function allAnchors(html){
  return [...String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map(match=>({attrs:match[1],label:match[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}));
}

test('every interactive MEL surface has an explicit control owner', async()=>{
  const normal=await (await renderNormal()).text();
  const full=await (await renderFull()).text();
  const watch=await (await renderWatch()).text();
  const fides=renderFidesGuestPage();
  const wordpress=renderPublicWordPressChatPage();
  const shard=await (await handleShardVaultStatus(new Request('https://mel.test/shardvault'),{})).text();

  assert.ok(allButtons(full).length>=80);
  assert.match(NORMAL_RUNTIME_SOURCE,/send\.addEventListener\('click'/);
  assert.match(NORMAL_RUNTIME_SOURCE,/full\.addEventListener\('click'/);
  assert.match(NORMAL_RUNTIME_SOURCE,/themeTrigger\.addEventListener\('click'/);
  assert.match(watch,/q\('#testAll'\)\.onclick=testAll/);
  assert.match(watch,/q\('#runReal'\)\.onclick=runReal/);
  assert.match(fides,/nav\.forEach\(b=>b\.addEventListener\('click'/);
  assert.match(fides,/document\.querySelectorAll\('\.suggestions button'\)\.forEach/);
  assert.match(fides,/form\.addEventListener\('submit'/);
  assert.match(wordpress,/f\.addEventListener\('submit'/);
  assert.match(shard,/\$\('refresh'\)\.onclick=load/);
  assert.match(shard,/\$\('snapshotNow'\)\.onclick=snapshot/);
  assert.match(shard,/\$\('search'\)\.onclick=search/);
  assert.match(shard,/\$\('reconstructCode'\)\.onclick=reconstructCode/);

  for(const html of [full,watch,fides,wordpress,shard]){
    for(const anchor of allAnchors(html)){
      const href=anchor.attrs.match(/\bhref=["']([^"']*)["']/i)?.[1]??null;
      const disabled=/aria-disabled=["']true["']/i.test(anchor.attrs);
      assert.ok((href!==null&&href.trim()!=='')||disabled,'link without destination: '+anchor.label);
    }
  }
});

test('MAX UI never equates permission with proven progress', async()=>{
  const source=await read('src/pages/full-interface-v2.js');
  assert.match(source,/MAX BLOQUÉ/);
  assert.match(source,/MAX AVANCE/);
  assert.match(source,/MAX ARMÉ/);
  assert.match(source,/progress_watchdog/);
  assert.match(source,/Jobs créés \/ terminés \/ bloqués/);
  assert.match(source,/Désactiver MAX/);
  assert.doesNotMatch(source,/badge\.textContent=active\?'ACTIVE'/);
});

test('obsolete Collector is not presented as a live LoRA component', async()=>{
  const source=await read('src/pages/full-interface-v2.js');
  assert.doesNotMatch(source,/Collector Kaggle/);
  assert.doesNotMatch(source,/freeCollectorState/);
  assert.doesNotMatch(source,/collector:collectorWf/);
  assert.match(source,/training:trainWf/);
  assert.match(source,/checkpoint:checkpoint/);
  assert.match(source,/promotion:wf/);
});

test('runtime tick workflow cannot stay green on persistent lease contention or tripped MAX watchdog', async()=>{
  const workflow=await read('.github/workflows/gen2-42-runtime-tick.yml');
  assert.match(workflow,/AUTONOMY_LEASE_BUSY_RETRY/);
  assert.match(workflow,/AUTONOMY_LEASE_BUSY_AFTER_RETRIES/);
  assert.match(workflow,/MAX_PROGRESS_WATCHDOG_TRIPPED/);
  assert.match(workflow,/progress\?\.work_remaining/);
  assert.match(workflow,/exit 67/);
  assert.match(workflow,/exit 69/);
});
