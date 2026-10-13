-- MEL Companion MCP device grants, review-required migration.
-- Create-only. No grants are inserted: default deny.
CREATE TABLE IF NOT EXISTS companion_mcp_device_grants (
 owner_subject TEXT NOT NULL,
 device_id TEXT NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 1 CHECK (revoked IN (0,1)),
 granted_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY (owner_subject, device_id),
 FOREIGN KEY (device_id) REFERENCES computer_devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_companion_mcp_device_grants_device ON companion_mcp_device_grants(device_id);
