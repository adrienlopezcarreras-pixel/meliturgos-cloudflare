import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_SOVEREIGNTY_INVENTORY,
  currentTechnicalSovereigntyReport,
} from '../../src/portability/technical-sovereignty-inventory.js';

test('canonical inventory never claims full sovereignty while live alternatives are missing',()=>{
  const report=currentTechnicalSovereigntyReport({maxAutonomy:true});
  assert.equal(report.fully_sovereign,false);
  assert.equal(report.ready_layers.includes('backup_restore'),true);
  assert.equal(report.ready_layers.includes('source_control'),false);
  assert.equal(report.ready_layers.includes('runtime'),false);
  assert.equal(report.ready_layers.includes('ai'),false);
});

test('backup/restore is the only currently live-proven alternate-provider layer',()=>{
  const report=currentTechnicalSovereigntyReport();
  assert.deepEqual(report.ready_layers,['backup_restore']);
  assert.equal(report.ready_layer_count,1);
  assert.equal(Object.keys(CURRENT_SOVEREIGNTY_INVENTORY).length,10);
});
