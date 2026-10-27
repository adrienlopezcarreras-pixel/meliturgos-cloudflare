import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { grantNeuronBonus, readNeuronBonus, readNeuronBonusTotal } from '../src/augmentio/neuron-budget.js';

test('owner banner totals all unexpired neuron reserves without modifying balances', async () => {
  const db = sqliteD1();
  const now = 1_800_000_000_000;
  await grantNeuronBonus(db, { id: 'first', neurons: 9000, expiresAt: now + 10000 });
  await grantNeuronBonus(db, { id: 'second', neurons: 18000, expiresAt: now + 20000 });
  await grantNeuronBonus(db, { id: 'expired', neurons: 50000, expiresAt: now - 1 });
  assert.equal(await readNeuronBonusTotal(db, { now }), 27000);
  assert.equal((await readNeuronBonus(db, { now })).remaining, 9000);
  assert.equal(await readNeuronBonusTotal(db, { now: now + 15000 }), 18000);
});
