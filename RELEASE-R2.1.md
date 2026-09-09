# MEL R2.1

Release corrective suivant R2.

## Correctifs
- `/api/chat` passe par le moteur Gen2 natif au lieu du `worker.js` de compatibilité.
- Les demandes d'accès/lecture du propre code déclenchent `code.read` de façon déterministe.
- `code.read` et `code.search` restent exécutables en cas de rate-limit GitHub REST grâce à un fallback borné sur le contenu brut public; les chemins secrets restent refusés.
- Mémoire cognitive explicite persistante et réinjectée au chat.
- `/api/memory/status` et `/api/export` restaurés pour le Mode complet.
- Work expose un préflight sûr Council-first sans affaiblir l'authentification du bridge d'écriture.
- Tests de régression dédiés pour Code, Mémoire et Work.

## Pin production
`MEL_GITHUB_BRANCH=release/mel-2026-09-09-r2-1`

La branche de release doit être créée sur le SHA final validé par les workflows complet et `.augmentio`.
