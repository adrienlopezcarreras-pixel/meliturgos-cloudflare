/**
 * Audit service. For now logs to console; in Gen2 will persist to D1.
 */
export function audit(action, request = null, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    path: request ? new URL(request.url).pathname : null,
    details,
  };
  console.log(JSON.stringify({ event: "audit", ...entry }));
}
