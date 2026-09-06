# MELITURGOS Professor V8 candidate

Candidate: `0.2.5-rc.1-professor-v8-fix-candidate.1`

- Production deployment: unchanged
- Worker before SHA-256: `9486a4c3b7f26da1246d2617b34d2d34183219122d5a0585aa1aa1b6d0413168`
- Worker candidate SHA-256: `f644a784457a90382d5dfa8ffb931992e235d4633a2bdfadc17b4b0d1d92bdc3`
- Wrangler SHA-256: `19685e8815975a27b5a8b5c8a7cf7af72cb967ae33601b62e597afab42eecd55`

Only the newline escapes in the injected capability and Knowledge scripts differ.

## Rollback local

From the project directory:

```bash
cp backups/2026-09-05-professor-v8-final-candidate/worker.before.js worker.js
cp backups/2026-09-05-professor-v8-final-candidate/wrangler.before.jsonc wrangler.jsonc
sha256sum worker.js wrangler.jsonc
```

The expected restored Worker hash is `9486a4c3b7f26da1246d2617b34d2d34183219122d5a0585aa1aa1b6d0413168`.

