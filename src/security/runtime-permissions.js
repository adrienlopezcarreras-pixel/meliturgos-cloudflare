export const PERSONAL_AGENT_OWNER_PERMISSIONS = Object.freeze([
  'google.gmail.read',
  'google.gmail.draft',
  'google.gmail.send',
  'google.calendar.read',
  'google.calendar.write',
  'google.calendar.delete',
  'google.tasks.read',
  'google.tasks.write',
  'google.tasks.delete',
]);

function normalize(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
    } catch {}
  }
  return raw.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
}

export function runtimeCapabilityPermissions(env = {}) {
  const configured = normalize(env.CAPABILITY_PERMISSIONS);
  const personalAgentEnabled = String(env.MEL_OWNER_PERSONAL_AGENT || '').trim().toLowerCase() === 'true';
  return [...new Set([
    ...configured,
    ...(personalAgentEnabled ? PERSONAL_AGENT_OWNER_PERMISSIONS : []),
  ])].sort();
}
