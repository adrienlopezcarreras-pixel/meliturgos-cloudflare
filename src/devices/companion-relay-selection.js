// Pure, read-only selector for scheduled physical Companion diagnostics.
// Device presence alone is not prior local authorization.
export function selectAuthorizedWindowsCompanion(devices, now = Date.now()) {
  const rows = Array.isArray(devices) ? devices : [];
  const eligible = rows.filter(row => {
    if (String(row?.platform || '').toLowerCase() !== 'windows') return false;
    if (row?.online !== true || row?.halted === true) return false;
    if (row?.metadata?.remote_access_enabled !== true) return false;
    const seen = Number(row?.last_seen_at);
    const engineSeen = Number(row?.metadata?.engine_heartbeat_at);
    return Number.isFinite(seen) && seen > 0 && seen <= now && now - seen <= 20_000
      && Number.isFinite(engineSeen) && engineSeen > 0 && engineSeen <= now
      && now - engineSeen <= 20_000;
  }).sort((a, b) =>
    Number(b?.last_seen_at || 0) - Number(a?.last_seen_at || 0));
  return {device: eligible[0] || null, eligible_count: eligible.length};
}
