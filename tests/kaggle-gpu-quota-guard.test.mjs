import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectKaggleGpuQuota} from '../scripts/kaggle-gpu-quota-guard.mjs';
test('Kaggle explicit zero free GPU blocks launch',()=>{
 assert.deepEqual(inspectKaggleGpuQuota([{resource:'GPU',used:'30.11h',remaining:'0.00h'}]),{status:'EXHAUSTED'});
 assert.deepEqual(inspectKaggleGpuQuota([{resource:'CPU',remaining:'0.00h'},{resource:'GPU',remaining:'0h'}]),{status:'EXHAUSTED'});
});
test('positive quota passes while missing or malformed data stays unknown',()=>{
 for(const remaining of ['0.01h','8.75h','20h'])assert.deepEqual(inspectKaggleGpuQuota([{resource:'GPU',remaining}]),{status:'AVAILABLE'});
 for(const q of [null,{},[],[{resource:'GPU'}],[{resource:'GPU',remaining:'unknown'}],[{resource:'CPU',remaining:'0h'}],[{resource:'GPU',remaining:'0h injected'}]])assert.deepEqual(inspectKaggleGpuQuota(q),{status:'UNKNOWN'});
});
