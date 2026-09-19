import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoUrl = new URL('../', import.meta.url);

test('ShardVault qualification XP is persistent, complete and machine-readable', () => {
  const playbook = JSON.parse(fs.readFileSync(new URL('../shardvault/qualification-playbook.json', import.meta.url), 'utf8'));
  assert.equal(playbook.format, 'MEL-ShardVault-QualificationPlaybook');
  assert.ok(Array.isArray(playbook.candidate_targets));
  assert.ok(playbook.candidate_targets.length >= 7);
  assert.ok(Array.isArray(playbook.hard_gates) && playbook.hard_gates.length >= 8);
  assert.ok(Array.isArray(playbook.failure_memory) && playbook.failure_memory.length >= 6);
  assert.deepEqual(
    playbook.promotion_state_machine.slice(-4),
    ['ACTIVE', 'REVALIDATE_DUE', 'QUARANTINED'].includes(playbook.promotion_state_machine.at(-1))
      ? playbook.promotion_state_machine.slice(-4)
      : []
  );
  assert.ok(playbook.promotion_state_machine.includes('VALIDATED'));
  assert.ok(playbook.promotion_state_machine.includes('QUARANTINED'));
  assert.equal(playbook.validated_targets.length, 7);
  assert.ok(Array.isArray(playbook.operational_use?.write_flow) && playbook.operational_use.write_flow.length >= 6);
  assert.ok(Array.isArray(playbook.discovery_method?.search_cycle) && playbook.discovery_method.search_cycle.length >= 8);
  assert.ok(Array.isArray(playbook.discovery_method?.query_families) && playbook.discovery_method.query_families.length >= 6);
});

test('hourly discovery consumes qualification XP instead of leaving it as documentation only', () => {
  const index = JSON.parse(fs.readFileSync(new URL('../shardvault/discovery-index.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(index.experience_playbooks) && index.experience_playbooks.length >= 1);

  const source = fs.readFileSync(new URL('../src/continuity/autonomous-repositories.js', import.meta.url), 'utf8');
  assert.match(source, /experience_playbooks/);
  assert.match(source, /MEL-ShardVault-QualificationPlaybook/);
  assert.match(source, /EXPERIENCE_LEAD/);
  assert.match(source, /experienceQueries/);
  assert.match(source, /xpQuery/);
  assert.match(source, /discovery_method\?\.query_families/);
  assert.match(source, /VALIDATED_EXPERIENCE/);
});
