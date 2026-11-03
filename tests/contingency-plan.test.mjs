import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReconstructionKit,
  currentContingency,
  judgeCandidate,
  maxStandby,
  placeReconstructionCopies,
  respondToScenario,
  allScenarios,
} from '../src/continuity/contingency-plan.js';

const index = { format: 'MEL-ShardVault-DiscoveryIndex', seed_leads: [] };
const sha = 'a'.repeat(40);

test('one failure, a chain, and a total outage each state their consequence', () => {
  const single = respondToScenario({ down: ['cloudflare'] });
  assert.equal(single.kind, 'SINGLE');
  assert.match(single.implication, /site et le tick cloud/);
  assert.match(single.consequence, /GitHub Actions prend le relais/);
  assert.equal(single.max, 'ACTIONS_RELAY_READY');
  assert.equal(single.activation_performed, false);

  const chain = respondToScenario({
    down: ['cloudflare', 'github'],
    standby: { companionOnline: true, localGit: true, localDb: true, localModel: true },
  });
  assert.equal(chain.kind, 'CHAIN');
  assert.equal(chain.max, 'STANDBY_READY');
  assert.match(chain.consequence, /continue sur le PC/);

  const total = respondToScenario({ down: ['pc', 'cloudflare', 'github'] });
  assert.equal(total.kind, 'TOTAL');
  assert.match(total.consequence, /relancer depuis gmail ou onedrive/);
  assert.equal(total.rebirth, 'FROM_PRIVATE_KIT');
});

test('MAX stays on Cloudflare while it answers, and the local standby is not claimed ready when the PC is off', () => {
  assert.equal(maxStandby({ cloudflareUp: true }).status, 'MAX_ON_CLOUDFLARE');
  const missing = maxStandby({ cloudflareUp: false, companionOnline: false, localGit: true, localDb: true, localModel: true });
  assert.equal(missing.status, 'STANDBY_NOT_READY');
  assert.deepEqual(missing.missing, ['pc']);
});

test('Gmail or OneDrive each suffice, and a public shard does not carry the key', () => {
  const kit = buildReconstructionKit({
    sourceSha: sha, encryptedBackup: 'cipher', keyId: 'key-1', keyB64: 'secret-key-value', index,
  });
  const copies = placeReconstructionCopies(kit);
  assert.equal(copies.gmail.sufficient_alone, true);
  assert.equal(copies.onedrive.body.backup.key_b64, 'secret-key-value');
  assert.equal(copies.shards.sufficient_alone, false);
  assert.equal(copies.shards.body.backup.key_b64, undefined);
  assert.equal(JSON.stringify(copies.shards).includes('secret-key-value'), false);
});

test('a document does not prove a candidate better, a failed live test neither', () => {
  assert.equal(judgeCandidate({ research: { kind: 'DOCUMENTARY', sources: [{ url: 'https://alt.example/docs' }] } }).status, 'DOCUMENTED_NOT_TESTED');
  const live = judgeCandidate({ research: { kind: 'SOFTWARE', available: true, reliable: true, smoke: true, measured_better: false } });
  assert.equal(live.status, 'NOT_BETTER');
  assert.equal(live.activation_allowed, false);
  const better = judgeCandidate({ research: { kind: 'PHYSICAL', available: true, reliable: true, smoke: true, measured_better: true } });
  assert.equal(better.status, 'BETTER_PROVEN');
  assert.equal(better.activation_allowed, false);
});

test('the live watch names the real case: Cloudflare up, PC absent', () => {
  const live = currentContingency({ cloudflareUp: true, companionOnline: false, githubUp: true });
  assert.equal(live.kind, 'SINGLE');
  assert.deepEqual(live.down, ['pc']);
  assert.equal(live.max, 'MAX_ON_CLOUDFLARE');
  assert.match(live.consequence, /reste sur Cloudflare/);
  const both = currentContingency({ cloudflareUp: false, companionOnline: false, githubUp: true });
  assert.equal(both.max, 'ACTIONS_RELAY_READY');
  assert.match(both.consequence, /GitHub Actions prend le relais/);
  assert.match(both.implication, /GitHub reste lisible/);
});

test('every combination of the seven parts has a countermeasure', () => {
  const all = allScenarios();
  assert.equal(all.length, 127);
  assert.equal(new Set(all.map(row => row.down.join('+'))).size, 127);
  assert.ok(all.every(row => row.countermeasure.length > 0 && row.implication && row.consequence));
  const nothing = all.find(row => row.down.length === 7);
  assert.ok(nothing.countermeasure.includes('STOP_MEMORY_KEY_UNAVAILABLE'));
  const gmailOnly = all.find(row => row.down.length === 1 && row.down[0] === 'gmail');
  assert.ok(gmailOnly.countermeasure.includes('KEEP_MAX_ON_CLOUDFLARE'));
  assert.ok(gmailOnly.countermeasure.includes('KEEP_REMAINING_PRIVATE_KIT'));
});

test('losing both private copies leaves the memory key unavailable', () => {
  const response = respondToScenario({ down: ['gmail', 'onedrive', 'cloudflare', 'pc', 'github'] });
  assert.equal(response.rebirth, 'MEMORY_KEY_UNAVAILABLE');
  assert.match(response.consequence, /ne contiennent pas la cle/);
});
