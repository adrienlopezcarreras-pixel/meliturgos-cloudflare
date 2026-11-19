// VIA Workbench skill catalog — passive, fail-closed MEL projection.
// The catalog is NOT a tool registry and grants no execution permissions.
// The producer (VIA) must separately authenticate the connection and validate
// action receipts. Do not accept this from end-user chat text or public HTTP.
export const WORKSHOP_SKILLS_SCHEMA = 'vi.workbench.mel-capabilities.v1';
export const WORKSHOP_ACTIONS_SCHEMA = 'vi.workbench.embedded-actions.v1';

const FAMILIES = Object.freeze({
  via: 'VIA',
  studio: 'ÉDITEUR',
  video: 'MÉDIA · vidéo',
  audio: 'MÉDIA · audio',
  companion: 'MEL Companion',
  social: 'PROMOTION',
});

const CAPABILITIES = Object.freeze({
  via: ['project.create', 'project.open', 'project.save'],
  studio: ['bat.validate', 'magazine.create', 'magazine.edit', 'magazine.export', 'page.preview'],
  video: ['media.import', 'quality.review', 'render.start', 'scene.edit', 'scene.preview'],
  audio: ['assembly.export', 'take.approve', 'timeline.edit', 'voice.record', 'voice.replay'],
  companion: ['control.request', 'message.send', 'session.inspect'],
  social: ['group.join', 'group.rules', 'group.search', 'group.select', 'post.publish'],
});

function noAccess(reason) {
  return Object.freeze({
    schema: WORKSHOP_SKILLS_SCHEMA,
    mode: 'workshop',
    source_verified: false,
    execution_authorized: false,
    status: reason,
    skills: Object.entries(CAPABILITIES).flatMap(([surface, actions]) =>
      actions.map(action => Object.freeze({
        id: surface + '.' + action, section: FAMILIES[surface],
        surface, action, available: false, status: 'unavailable',
      }))),
  });
}

// A display-only projection. Every property is allowlisted and all unknown
// values are excluded. The caller is responsible for passing an independently
// authenticated snapshot; no token, URL or private evidence enters the view.
export function describeWorkshopSkills(snapshot, {authenticated = false} = {}) {
  if (authenticated !== true || !snapshot || typeof snapshot !== 'object'
      || Array.isArray(snapshot) || snapshot.schema !== WORKSHOP_SKILLS_SCHEMA
      || snapshot.source_schema !== WORKSHOP_ACTIONS_SCHEMA
      || snapshot.execution_authorized !== false
      || !Array.isArray(snapshot.skills)
      || snapshot.skills.length !== Object.values(CAPABILITIES).reduce((n, a) => n + a.length, 0)) {
    return noAccess('not_authenticated_or_invalid');
  }
  const indexed = new Map();
  for (const item of snapshot.skills) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.surface !== 'string' || !(item.surface in CAPABILITIES)
        || !Object.prototype.hasOwnProperty.call(CAPABILITIES, item.surface)
        || typeof item.id !== 'string'
        || !CAPABILITIES[item.surface].some(action => item.id === item.surface + '.' + action)
        || indexed.has(item.id) || typeof item.connected !== 'boolean'
        || typeof item.verified_in_window !== 'boolean'
        || typeof item.available !== 'boolean'
        || typeof item.status !== 'string'
        || typeof item.requires_approval !== 'boolean') {
      return noAccess('invalid_skill_catalog');
    }
    indexed.set(item.id, item);
  }
  const skills = [];
  for (const [surface, actions] of Object.entries(CAPABILITIES)) {
    for (const action of actions) {
      const id = surface + '.' + action;
      const item = indexed.get(id);
      if (!item) return noAccess('missing_skill');
      const ready = item.connected === true && item.verified_in_window === true
        && item.available === true && item.status === 'verified';
      // Only the exact boolean readout is projected. This does not authorize
      // MEL to invoke an action (that requires separate approvals and tokens).
      skills.push(Object.freeze({
        id, surface, action, section: FAMILIES[surface],
        requires_approval: item.requires_approval === true,
        available: ready,
        status: ready ? 'verified' : 'unavailable',
      }));
    }
  }
  return Object.freeze({
    schema: WORKSHOP_SKILLS_SCHEMA,
    mode: 'workshop',
    source_verified: true,
    execution_authorized: false,
    status: 'catalog_read_only',
    skills,
  });
}

export function workshopSkillSummary(projection) {
  const skills = Array.isArray(projection?.skills) ? projection.skills : [];
  return Object.freeze({
    sections: ['VIA', 'ÉDITEUR', 'MÉDIA · vidéo', 'MÉDIA · audio',
      'MEL Companion', 'PROMOTION'].map(section => ({
        section,
        total: skills.filter(s => s.section === section).length,
        verified: skills.filter(s => s.section === section && s.available === true).length,
      })),
    execution_authorized: false,
  });
}
