# MELITURGOS - Security Cleanup Roadmap

## Introduction

**GEN2-64: Structural Code Cleanup Phase**
- Remove dead code and obsolete interfaces from security, audit, and middleware
- Improve maintainability and reduce cognitive load
- Align codebase with current Gen2 architecture

## Cleanup Objectives

1. **Remove obsolete functions**: Functions no longer called or superseded
2. **Clean up unused imports**: Dependencies imported but not used
3. **Modernize patterns**: Replace deprecated patterns with Gen2 standards
4. **Remove legacy code**: Code from Gen1 or deprecated phases
5. **Document deprecations**: Clearly mark what's being removed and why

## Phase 1: Security Layer Cleanup

### Files to Review

#### `src/security/` (if exists)
- Check for obsolete security patterns
- Remove deprecated functions
- Clean up unused imports

#### `worker.js` - Security Functions

Current functions looking for cleanup:

| Function | Status | Action |
|----------|--------|--------|
| `authorized(req,env)` | USED | Keep (Basic Auth) |
| `secret()` | USED | Keep (secret filtering) |
| `securityGate(request)` | USED | Keep (CSRF, rate limit) |
| `safeEqual(a,b)` | USED | Keep (timing-safe comparison) |

### Tests to Create

1. **`tests/security-cleanup.test.mjs`**
   - Verify all security functions are used
   - Run linter to find unused imports
   - Document findings

## Phase 2: Audit Layer Cleanup

### Files to Review

#### `src/audit/audit-service.js`

Current state: GEN2-45 COMPLETE
- ✅ Uses D1 persistence (not console)
- ✅ Uses `db.prepare().bind().run()` pattern
- ✅ Error handling in try-catch

Further cleanup opportunities:
- Remove old console.log statements (left as fallback)
- Clean up unused variables
- Remove commented-out legacy code

#### Test files
- `tests/audit-persistence.test.mjs` - Needs cleanup if old tests remain

## Phase 3: Connector Registry Cleanup

### Files to Review

#### `worker.js` - CONNECTOR_REGISTRY

Current connectors:
```js
const CONNECTOR_REGISTRY = [
  { type: "google", name: "Gmail", status: "disabled" },
  { type: "google", name: "Google Agenda", status: "disabled" },
  { type: "google", name: "Google Drive", status: "disabled" },
  { type: "microsoft", name: "Outlook", status: "disabled" },
  { type: "microsoft", name: "OneDrive", status: "disabled" },
  { type: "microsoft", name: "SharePoint", status: "disabled" },
  { type: "github", name: "GitHub", status: "disabled" },
  { type: "cloudflare", name: "Cloudflare", status: "disabled" },
  { type: "vercel", name: "Vercel", status: "disabled" }
];
```

Cleanup actions:
1. Remove disabled connectors (document in README)
2. Remove OAuth placeholders that will never be implemented
3. Keep only requirements list in documentation

## Phase 4: Middleware Cleanup

### Files to Review

#### Potential middleware in `src/core/`

Identify and clean up:
- Mark deprecated middleware patterns
- Remove unused wrappers
- Document migration path for any supervised HTTP functions

## Phase 5: Migration Cleanup

### Files in `/backups/`

Review and potentially remove:
- Old migration scripts (after they've been applied to actual migrations)
- Overlapping backup directories
- Old rollback scripts

## Action Items

### Immediate Actions

1. **Run linter** to identify unused imports
   ```bash
   npm run lint  # if configured
   node --check worker.js
   ```

2. **Audit security functions** in `worker.js`
   - List all functions
   - Mark which are used in routes
   - Document unused functions for removal

3. **Create migration checklist** for each cleanup phase

### Documentation Updates

1. Update `docs/MELITURGOS-MASTER-SPEC.md` to reflect cleanup
2. Update `docs/MELITURGOS-MASTER-CHECKLIST.md` with cleanup tasks
3. Add note in `docs/gen2-resume.md` about code hygiene

## Success Criteria

✅ No unused imports or functions detected
✅ Code runs without warnings (node --check)
✅ All security functions remain functional
✅ Documentation updated with cleanup history
✅ Tests still pass after cleanup

## Status

- [ ] Phase 1: Security Cleanup
- [ ] Phase 2: Audit Cleanup
- [ ] Phase 3: Connector Cleanup
- [ ] Phase 4: Middleware Cleanup
- [ ] Phase 5: Migration Cleanup

## Notes

Cette phase est NON-BLOQUANTE - une fois la validation UI terminée, continuer immédiatement le code cleanup.

Tant qu'une tâche réalisable existe, continuer.