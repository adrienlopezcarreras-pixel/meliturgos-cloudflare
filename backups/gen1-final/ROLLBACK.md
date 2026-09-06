# ROLLBACK GEN 1 → GEN2 START

Fichiers originaux sauvegardés :
- backups/gen1-final/code/worker.js
- backups/gen1-final/config/wrangler.jsonc
- backups/gen1-final/config/package.json
- backups/gen1-final/docs/*.txt
- backups/gen1-final/tests/*
- backups/gen1-final/runner/*
- backups/gen1-final/assets/*

Base D1 :
- backups/gen1-final/database/schema.sql
- backups/gen1-final/database/d1_export.json

Procédure de rollback complet :
```bash
cp backups/gen1-final/code/worker.js ./worker.js
cp backups/gen1-final/config/wrangler.jsonc ./wrangler.jsonc
cp backups/gen1-final/config/package.json ./package.json
# D1 : wrangler d1 execute meliturgos-memory --file backups/gen1-final/database/schema.sql
# puis importer d1_export.json via /api/import add_only
```
