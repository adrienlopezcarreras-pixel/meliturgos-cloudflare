# MEL — Réconciliation roadmap cœur — 25 septembre 2026

## Périmètre

Ce lot est strictement limité au cœur MEL : backend, mémoire, contexte, orchestration et roadmap.

Hors périmètre absolu de ce lot :
- APK Android / GEN2-27 / GEN2-58 ;
- MEL MINI, firmware et matériel ;
- Bluetooth / BLE ;
- interface mobile et interface MINI ;
- compilation, flash, signature ou packaging mobile.

Le but est d’éviter qu’un worker recrée un composant déjà présent sur `main` alors que la roadmap l’affiche encore comme `PLANNED`.

## Constat vérifié sur `main`

### MEL-CONTEXT-03 — Open loops

Présent :
- `src/conversations/open-loop-service.js`
- store D1 et store mémoire ;
- capture idempotente ;
- états open/waiting/resumable/failed/completed/cancelled ;
- lease de reprise ;
- retry après erreur ;
- tests `tests/conversations/open-loop-service.test.mjs`.

État roadmap retenu : `PARTIAL`.

Reste à faire :
- raccorder automatiquement la capture aux travaux Work ;
- raccorder les événements au Event Bus ;
- déclencher la reprise par le runtime/heartbeat ;
- démontrer une reprise automatique de bout en bout.

### GEN2-12 — Timeline personnelle

Présent :
- `src/memory/timeline.js` ;
- contrat de domaine ;
- validation des événements et requêtes ;
- adapter in-memory ;
- tests `tests/gen2/timeline.test.mjs`.

État roadmap retenu : `PARTIAL`.

Reste à faire :
- persistance D1 ;
- alimentation depuis MemoryService / Projects / Decisions ;
- requêtes durables après redémarrage ;
- preuve d’intégration runtime.

### GEN2-13 — Projects / Decisions

Présent :
- `src/planning/project-service.js` ;
- projets, décisions, leçons ;
- historique de statuts ;
- filtres et lectures ;
- tests `tests/gen2/projects-decisions.test.mjs`.

État roadmap retenu : `PARTIAL`.

Reste à faire :
- store durable ;
- liaison Work / mémoire / open loops ;
- reconstruction cohérente après redémarrage ;
- preuve runtime.

### MEL-EVOL-05 — Skill Registry durable

Présent :
- `src/evolution/skill-registry.js` ;
- versions de skills ;
- capacités ;
- preuves ;
- activation, rollback ;
- snapshots portables ;
- abstraction de persistance ;
- tests `tests/gen2/skill-registry.test.mjs`.

État roadmap retenu : `PARTIAL`.

Reste à faire :
- store durable de production ;
- liaison Module Lab / LearningEngine ;
- preuve export -> perte de runtime -> restore -> état identique.

### GEN2-40 — Event Bus idempotent / follow-ups

Présent :
- `src/events/event-bus.js` ;
- enveloppe événement immuable ;
- idempotency key ;
- scheduling ;
- leases ;
- retry et dead-letter ;
- adapter in-memory.

État roadmap retenu : `PARTIAL`.

Reste à faire :
- backend durable D1/Queue ;
- branchement Work Engine ;
- branchement OpenLoopService ;
- preuve de follow-up idempotent après redémarrage.

## Règle de coordination multi-workers

Un composant déjà présent sur `main` ne doit pas être réécrit depuis zéro. La suite doit partir du code canonique actuel, ajouter uniquement la couche manquante, puis laisser l’intégrateur unique décider de la fusion.

Ce lot ne modifie volontairement aucun fichier Android, MINI, BLE ou UI.
