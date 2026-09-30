import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAL_AGENT_OWNER_PERMISSIONS,
  runtimeCapabilityPermissions,
} from '../../src/security/runtime-permissions.js';

test('personal-agent owner profile grants every implemented Google Workspace permission', () => {
  const permissions = runtimeCapabilityPermissions({ MEL_OWNER_PERSONAL_AGENT: 'true' });
  assert.deepEqual(permissions, [...PERSONAL_AGENT_OWNER_PERMISSIONS].sort());
  for (const required of [
    'google.gmail.read',
    'google.gmail.draft',
    'google.gmail.send',
    'google.calendar.read',
    'google.calendar.write',
    'google.calendar.delete',
    'google.tasks.read',
    'google.tasks.write',
    'google.tasks.delete',
  ]) assert.ok(permissions.includes(required), required);
});

test('personal-agent permissions stay fail-closed when profile is disabled', () => {
  assert.deepEqual(runtimeCapabilityPermissions({}), []);
  assert.deepEqual(runtimeCapabilityPermissions({ MEL_OWNER_PERSONAL_AGENT:'false' }), []);
});

test('explicit configured permissions are preserved and deduplicated', () => {
  const permissions = runtimeCapabilityPermissions({
    MEL_OWNER_PERSONAL_AGENT:'true',
    CAPABILITY_PERMISSIONS:'custom.read,google.gmail.read custom.write',
  });
  assert.ok(permissions.includes('custom.read'));
  assert.ok(permissions.includes('custom.write'));
  assert.equal(permissions.filter(value => value === 'google.gmail.read').length, 1);
});
