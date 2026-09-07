/**
 * Audit service. Persists audit logs to D1 for observability and diagnostics.
 *
 * GEN2-45: Changed from console-only logging to D1 persistence
 */
export async function audit(db, action, request = null, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    path: request ? new URL(request.url).pathname : null,
    details,
  };

  // Persist to D1 instead of console log
  try {
    const stmt = await db.prepare(`
      INSERT INTO audit_logs (
        timestamp, action, path, details_json,
        client_ip, user_agent, request_method, response_status, error_message, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    await stmt.bind(
      Date.now(),
      action,
      entry.path,
      JSON.stringify(entry.details),
      request?.headers?.get('cf-connecting-ip') || null,
      request?.headers?.get('user-agent') || null,
      request?.method || null,
      null, // response_status - update on response
      null, // error_message - update on error
      null  // duration_ms - update on response
    ).run();
  } catch (error) {
    // Silently fail to avoid audit itself blocking operations
    console.error(`Failed to persist audit log: ${error.message}`);
  }
}
