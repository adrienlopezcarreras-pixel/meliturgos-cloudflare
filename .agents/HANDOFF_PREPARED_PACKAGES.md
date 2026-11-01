# Handoff — paquets préparés MAX (01/11/2026, 13h40 Paris)

Procédure par paquet : branche `claude/<id>-impl` (code + test) → `npm test` doit afficher ` 0 failed` →
branche `prepared-<id>` depuis main → `node scripts/prepare-mission.mjs MEL-<ID> claude/<id>-impl "<résumé>"` →
`node --test tests/prepared-mission-packages.test.mjs` 0 failed → PR REST + merge.

Règles apprises :
- Le paquet doit couvrir TOUS les fichiers code/test nommés par le contrat, sinon le Council rejette.
- Une mission partageant un fichier avec un paquet non prouvé doit attendre, puis être reconstruite.
- Un paquet dont le contenu est devenu identique à main est livré : le retirer, il bloque les suivants.

## Paquets présents (prepared/)
AUDIT-04, AUDIT-05, AUDIT-06, AUDIT-07, CHAT-06, CHAT-07, CHAT-08, COUNCIL-OPS-02, FOUNDER-02,
FOUNDER-05, MANIFEST-01, MANIFEST-02, MANIFEST-06, MANIFEST-07, MANIFEST-08, MANIFEST-09,
UI-AUDIT-04, UI-AUDIT-07.

## Codés, en attente d'une preuve (branche poussée, reconstruire après preuve)
| Mission | Branche | Attend la preuve de | Fichier partagé |
|---|---|---|---|
| AUDIT-02 | claude/audit-02-impl | AUDIT-06 | tests/development-audit.test.mjs |
| AUDIT-03 | claude/audit-03-impl | AUDIT-05 | domain-audit.js + test |
| MANIFEST-10 | claude/manifest-10-impl | MANIFEST-01 | manifest-01-acceptance.js + autonomy-readiness test |
Reconstruire : `git checkout claude/<id>-impl && git merge origin/main` (résoudre), `npm test` 0 failed, puis la procédure.

## À coder (conflit avec un paquet non prouvé)
- UI-AUDIT-06 : après UI-AUDIT-07 (scripts/ui-production-audit.mjs).
- UI-AUDIT-03 : après UI-AUDIT-07 et UI-AUDIT-04.
- MANIFEST-03, FOUNDER-03 : après MANIFEST-08 / CHAT-08 (capability-bus.js).
- MANIFEST-02 : la reprise sur checkpoint n'est PAS encore branchée dans autonomy-runtime-core.js
  (fichier pris par le paquet FOUNDER-02). À finir une fois FOUNDER-02 prouvé.

## Attention en cours
MANIFEST-08 (en échec, sans mission active) et CHAT-08 touchent capability-bus.js et
google-workspace-capabilities.js. Leurs diffs ne se chevauchent pas, mais le premier appliqué
invalide l'autre : rebâtir le perdant.

## Bloqués externes (pas de paquet)
FOUNDER-06, FOUNDER-08, UI-AUDIT-05, LORA-CHAT-01, LORA-MODE-01.

## Hors périmètre
Le mode UNCENSORED (chemin Venice) n'est pas repris par cette session.
