import { test } from 'node:test';
import assert from 'node:assert/strict';
import { D1EvolutionLedger, LEDGER_GENESIS, evolutionLedgerEntryHash } from '../../src/evolution/evolution-ledger.js';
import { D1DevJobRepository } from '../../src/dev/d1-dev-job-repository.js';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerEvolutionLedgerCapabilities } from '../../src/capabilities/evolution-ledger-capabilities.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

test('evolution ledger appends an immutable SHA-256 chain and verifies it', async () => {
  const db = sqliteD1();
  try {
    const ledger = new D1EvolutionLedger(db);
    const first = await ledger.append({
      event_id: 'event-1',
      evolution_id: 'job-1',
      stage: 'JOB_CREATED',
      status: 'QUEUED',
      actor: 'owner-chat',
      evidence: { roadmap_id: 'MEL-EVOL-04' },
      occurred_at: 1000,
    });
    const second = await ledger.append({
      event_id: 'event-2',
      evolution_id: 'job-1',
      stage: 'COUNCIL_COMPLETE',
      status: 'COUNCIL_COMPLETE',
      actor: 'mel-autonomy',
      source_sha: 'a'.repeat(40),
      branch: 'candidate/test',
      evidence: { council: { responses: 2 } },
      occurred_at: 2000,
    });

    assert.equal(first.appended, true);
    assert.equal(first.entry.previous_hash, LEDGER_GENESIS);
    assert.match(first.entry.entry_hash, /^[a-f0-9]{64}$/);
    assert.equal(second.entry.previous_hash, first.entry.entry_hash);

    const verification = await ledger.verify();
    assert.equal(verification.ok, true);
    assert.equal(verification.count, 2);
    assert.equal(verification.head_hash, second.entry.entry_hash);
  } finally {
    db.close();
  }
});

test('evolution ledger event ids are idempotent', async () => {
  const db = sqliteD1();
  try {
    const ledger = new D1EvolutionLedger(db);
    const input = {
      event_id: 'same-event',
      evolution_id: 'job-1',
      stage: 'JOB_UPDATED',
      status: 'WAITING_TEACHER',
      occurred_at: 3000,
      evidence: { teacher: true },
    };
    const first = await ledger.append(input);
    const replay = await ledger.append(input);
    assert.equal(first.appended, true);
    assert.equal(replay.appended, false);
    assert.equal(replay.entry.entry_hash, first.entry.entry_hash);
    assert.equal((await ledger.list()).length, 1);
  } finally {
    db.close();
  }
});

test('ledger verification detects evidence tampering', async () => {
  const db = sqliteD1();
  try {
    const ledger = new D1EvolutionLedger(db);
    await ledger.append({
      event_id: 'tamper-1',
      evolution_id: 'job-tamper',
      stage: 'JOB_CREATED',
      status: 'QUEUED',
      evidence: { safe: true },
      occurred_at: 4000,
    });
    await db.prepare('UPDATE evolution_ledger SET evidence_json=? WHERE event_id=?')
      .bind('{"safe":false}', 'tamper-1')
      .run();

    const verification = await ledger.verify();
    assert.equal(verification.ok, false);
    assert.ok(verification.failures.some(row => row.code === 'ENTRY_HASH_MISMATCH'));
  } finally {
    db.close();
  }
});

test('D1DevJobRepository records creation and durable job mutations automatically', async () => {
  const db = sqliteD1();
  try {
    const repository = new D1DevJobRepository(db);
    const created = await repository.create({
      id: 'ledger-job-1',
      requested_by: 'owner-chat',
      goal: 'Ajouter une capacité test',
      optional_context: {
        source: 'owner-chat',
        roadmap_id: 'MEL-EVOL-04',
        candidate_branch_only: true,
        zero_added_cost: true,
      },
    });
    assert.equal(created.status, 'QUEUED');

    const updated = await repository.update(created.id, {
      status: 'COUNCIL_COMPLETE',
      plan_json: { preflight: { status: 'READY' } },
    });
    assert.equal(updated.status, 'COUNCIL_COMPLETE');

    const ledger = new D1EvolutionLedger(db);
    const rows = await ledger.list({ evolution_id: created.id });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].stage, 'JOB_CREATED');
    assert.equal(rows[0].status, 'QUEUED');
    assert.equal(rows[1].stage, 'JOB_UPDATED');
    assert.equal(rows[1].status, 'COUNCIL_COMPLETE');
    assert.equal(rows[1].evidence.previous_status, 'QUEUED');
    assert.equal(rows[1].evidence.next_status, 'COUNCIL_COMPLETE');
    assert.deepEqual(rows[1].evidence.changed_fields, ['plan_json', 'status']);

    const verification = await ledger.verify();
    assert.equal(verification.ok, true);
  } finally {
    db.close();
  }
});

test('read-only CapabilityBus ledger endpoints expose entries and chain verification', async () => {
  const db = sqliteD1();
  try {
    const ledger = new D1EvolutionLedger(db);
    await ledger.append({
      event_id: 'cap-event-1',
      evolution_id: 'cap-job',
      stage: 'JOB_CREATED',
      status: 'QUEUED',
      occurred_at: 5000,
    });

    const bus = new CapabilityBus();
    registerEvolutionLedgerCapabilities(bus, { DB: db });
    const context = { owner: 'adrien', permissions: [], requestId: 'ledger-cap-test' };

    const rows = await bus.execute('evolution.ledger.list', { evolution_id: 'cap-job' }, context);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event_id, 'cap-event-1');

    const verification = await bus.execute('evolution.ledger.verify', {}, context);
    assert.equal(verification.ok, true);
    assert.equal(verification.count, 1);
  } finally {
    db.close();
  }
});

test('evolution ledger verifies more than the former 2000-row ceiling in bounded pages', async () => {
  const db = sqliteD1();
  try {
    const ledger = new D1EvolutionLedger(db);
    await ledger.ensure();
    let previousHash = LEDGER_GENESIS;
    const total = 2005;
    for (let index = 1; index <= total; index += 1) {
      const row = {
        event_id: `bulk-event-${index}`,
        evolution_id: 'bulk-proof',
        stage: 'JOB_UPDATED',
        status: 'RUNNING',
        actor: 'test',
        source_sha: 'b'.repeat(40),
        branch: 'candidate/bulk-proof',
        evidence: { index },
        occurred_at: 10000 + index,
        previous_hash: previousHash,
      };
      const entryHash = await evolutionLedgerEntryHash(row);
      await db.prepare(`INSERT INTO evolution_ledger(
        event_id,evolution_id,stage,status,actor,source_sha,branch,
        evidence_json,occurred_at,previous_hash,entry_hash
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
        row.event_id,
        row.evolution_id,
        row.stage,
        row.status,
        row.actor,
        row.source_sha,
        row.branch,
        JSON.stringify(row.evidence),
        row.occurred_at,
        row.previous_hash,
        entryHash,
      ).run();
      previousHash = entryHash;
    }

    const verification = await ledger.verify({ page_size: 127 });
    assert.equal(verification.ok, true);
    assert.equal(verification.count, total);
    assert.equal(verification.verified, total);
    assert.equal(verification.head_hash, previousHash);

    const deliberatelyBounded = await ledger.verify({ limit: 2000, page_size: 127 });
    assert.equal(deliberatelyBounded.ok, false);
    assert.equal(deliberatelyBounded.code, 'EVOLUTION_LEDGER_VERIFY_LIMIT_EXCEEDED');
    assert.equal(deliberatelyBounded.count, total);
    assert.equal(deliberatelyBounded.verified, 0);
  } finally {
    db.close();
  }
});

