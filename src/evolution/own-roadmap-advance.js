// Scheduling rule owned by this module.
// A software mission is not frozen by a human or external parent, and a
// prepared package may run after the model attempt budget is spent.
// The dependency list itself is unchanged. This only decides what can start.

const CLOSED = new Set(['DONE', 'DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']);
const EXTERNAL = new Set(['BLOCKED_HUMAN', 'BLOCKED_EXTERNAL']);

export const OWN_PREPARED_IDS = Object.freeze([
  'MEL-AUDIT-04',
  'MEL-AUDIT-05',
  'MEL-AUDIT-06',
  'MEL-AUDIT-07',
  'MEL-COUNCIL-OPS-02',
  'MEL-FOUNDER-02',
  'MEL-FOUNDER-05',
  'MEL-FOUNDER-06',
  'MEL-LORA-CHAT-01',
  'MEL-LORA-MODE-01',
  'MEL-MANIFEST-01',
  'MEL-MANIFEST-02',
  'MEL-MANIFEST-06',
  'MEL-MANIFEST-07',
  'MEL-MANIFEST-08',
  'MEL-MANIFEST-09',
  'MEL-UI-AUDIT-04',
  'MEL-UI-AUDIT-07',
]);

function closed(item) {
  return CLOSED.has(String(item?.status || '').trim().toUpperCase());
}

function external(item) {
  const status = String(item?.status || '').trim().toUpperCase();
  const acceptance = String(item?.external_acceptance?.status || '').trim().toUpperCase();
  return EXTERNAL.has(status) || EXTERNAL.has(acceptance);
}

export function unmetSoftwarePrerequisites(item, roadmap = [], verifiedIds = []) {
  const passed = new Set(verifiedIds);
  const byId = new Map();
  for (const row of roadmap) {
    if (row?.id) byId.set(row.id, row);
    if (closed(row)) passed.add(row.id);
  }
  const deps = Array.isArray(item?.depends_on) ? item.depends_on : [];
  return deps.filter(id => {
    const parent = byId.get(id);
    if (parent && external(parent)) return false;
    return !passed.has(id);
  });
}

export function preparedBypassesExhaustion(itemId, preparedIds = OWN_PREPARED_IDS) {
  return new Set(preparedIds).has(itemId);
}
