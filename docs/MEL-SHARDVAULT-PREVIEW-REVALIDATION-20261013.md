# MEL ShardVault — revalidation de preview isolée (2026-10-13)

## Point de départ vérifié

- Preview GitHub Actions n°38416190014 : échec de l'étape `Prove ShardVault external code reconstruction` après `QUORUM_COPIED` à 6/7, puis `RETRY_TARGETS` à 6/7.
- Les contrôles CI préalables ont réussi, mais ne constituent pas une preuve de reconstruction externe complète.
- La branche candidate et `main` sont divergentes : ne pas remplacer la candidate par `main` et ne pas forcer de rebase/reset sans réconciliation.
- La candidate emploie `scripts/fulfill-preview-code-mirror.mjs`, le bucket R2 isolé et la branche miroir `shardvault-preview-mirror`.
- Les corrections côté `main` sont suivies par les PR #1278 et #1279, toutes deux validées par leurs CI ciblées.

## Preuves requises pour clôturer ce point

1. Preview issue du SHA exact de cette branche candidate, avec D1 et R2 preview confirmés distincts de la production.
2. Sept fragments externes copiés, relus et vérifiés par hash ; au moins un fragment sur le miroir GitHub isolé.
3. Reconstruction 4/7 et épreuve de perte de trois fragments sur des réponses HTTP réelles, sans archive locale comme secours.
4. Stress API et UI, autonomie, apprentissage et contrôle final de mise en pause de la preview.
5. Artefacts et journaux GitHub Actions conservés, sans secrets et avec numéro de run et SHA exact.

L'ajout de ce fichier sur la branche candidate constitue une modification documentaire servant à relancer le workflow `deploy-candidate-preview` sur `push`. Il ne constitue pas, à lui seul, une validation 7/7.
