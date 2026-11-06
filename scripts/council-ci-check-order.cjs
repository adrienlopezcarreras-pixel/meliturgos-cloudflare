'use strict';

// GitHub assigns check-run IDs at creation, not completion. A second,
// cancelled duplicate workflow can have a higher ID but finish before the
// first run successfully completes. Keep the latest *observed outcome* for
// each check name rather than blindly keeping the largest ID.
// Pending checks are ordered by their started timestamp and stay blocking
// if they are newer than the latest completed result.
function selectLatestCheckOutcomes(checks) {
  if (!Array.isArray(checks)) throw new Error('COUNCIL_CI_CHECKS_INVALID');
  const latest = new Map();
  const timestamp = row => {
    const source = row?.completed_at || row?.started_at;
    const millis = Date.parse(String(source || ''));
    return Number.isFinite(millis) ? millis : -1;
  };
  for (const row of checks) {
    if (!row || typeof row.name !== 'string' || !row.name)
      throw new Error('COUNCIL_CI_CHECK_INVALID');
    const current = latest.get(row.name);
    if (!current || timestamp(row) > timestamp(current)
      || (timestamp(row) === timestamp(current) && Number(row.id) > Number(current.id)))
      latest.set(row.name, row);
  }
  return latest;
}
module.exports = { selectLatestCheckOutcomes };
