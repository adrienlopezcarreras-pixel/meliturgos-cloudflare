-- Preview-only review-required revocation store. No token material stored.
CREATE TABLE IF NOT EXISTS companion_mcp_token_revocations (
 token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
 revoked_at INTEGER NOT NULL
);
