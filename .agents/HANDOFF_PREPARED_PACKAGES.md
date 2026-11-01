# Handoff — paquets préparés MAX (01/11/2026)

Procédure par paquet : branche `claude/<id>-impl` (code + test) → `npm test` doit afficher ` 0 failed` →
branche `prepared-<id>` depuis main → `node scripts/prepare-mission.mjs MEL-<ID> claude/<id>-impl "<résumé>"` →
`node --test tests/prepared-mission-packages.test.mjs` 0 failed → PR REST + merge. Le base_sha256 vient de main :
une mission qui partage un fichier avec un paquet non prouvé doit attendre la preuve, puis être reconstruite.

## Publiés (dans prepared/)
CHAT-07 (#2989), UI-AUDIT-04 (#2991), MANIFEST-02 (#2993, lease uniquement ; câblage core après preuve FOUNDER-02).

## Codés, en attente d'une preuve (branche poussée, reconstruire après preuve)
| Mission | Branche | Attend la preuve de | Fichier partagé |
|---|---|---|---|
| AUDIT-02 | claude/audit-02-impl | AUDIT-06 | tests/development-audit.test.mjs |
| AUDIT-03 | claude/audit-03-impl | AUDIT-05 | domain-audit.js + test |
| MANIFEST-10 | claude/manifest-10-impl | MANIFEST-01 | manifest-01-acceptance.js + autonomy-readiness test |
Reconstruire : `git checkout claude/<id>-impl && git merge origin/main` (résoudre), `npm test` 0 failed, puis la procédure.

## À coder (conflit avec un paquet non prouvé)
CHAT-05 (après CHAT-04), CHAT-08 / FOUNDER-03 / MANIFEST-03 (capability-bus.js : après MANIFEST-08), UI-AUDIT-03/06/07
(ui-production-audit.mjs : après AUDIT-04 ; UI-AUDIT-03 aussi après UI-AUDIT-04).

## Bloqués externes (pas de paquet)
FOUNDER-06, FOUNDER-08, UI-AUDIT-05, LORA-CHAT-01, LORA-MODE-01.
