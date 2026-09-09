# BOOTSTRAP — connecter MEL au Teacher Bridge GitHub

Objectif : permettre à MELITURGOS de poser automatiquement une question à ChatGPT via les deux files GitHub suivantes :

- `teacher-bridge/requests.jsonl`
- `teacher-bridge/replies.jsonl`

## Contraintes
- Ne jamais stocker ni envoyer de mot de passe, clé API, token, OTP ou secret dans les files.
- Le token GitHub éventuel doit rester dans un secret Cloudflare ou secret local, jamais D1 ni le dépôt.
- Permissions minimales : lecture du dépôt + écriture sur ces deux fichiers uniquement si possible.
- Aucun déploiement production automatique.
- Aucun changement DNS.
- Aucune migration D1 destructive.
- Modifications de code uniquement en candidate branch avec tests/diff/review.

## Travail demandé à MEL
1. Inspecter l'architecture existante `src/teachers`, `src/capabilities`, `src/dev`, `src/core` et les services runtime.
2. Ajouter un `TeacherBridge` GitHub minimal et indépendant de l'UI.
3. API interne cible :
   - `teacher.ask({area, priority, goal, current_state, evidence, blocker_or_question, proposed_next_step})`
   - génère `request_id`
   - append une ligne JSON dans `teacher-bridge/requests.jsonl`
   - status local `WAITING_TEACHER`
   - poll périodique de `teacher-bridge/replies.jsonl`
   - récupère uniquement `TEACHER_REPLY` avec même `request_id`
   - archive la provenance
   - reprend le workflow concerné.
4. Éviter les doublons : un `request_id` ne doit être envoyé qu'une fois et une réponse ne doit être consommée qu'une fois.
5. Prévoir timeouts/retry/backoff et état `TEACHER_UNAVAILABLE` sans bloquer le reste de MEL.
6. Exposer un healthcheck `teacher.github` avec `ONLINE|OFFLINE|DEGRADED`.
7. Le Teacher Bridge ne doit jamais donner au professeur un accès direct aux secrets ni à la production.
8. Tests minimum : request append, reply matching, duplicate prevention, malformed JSON ignored safely, missing reply, offline GitHub, provenance persistence.
9. Ne pas refaire l'interface. UI en dernier.

## Priorité fonctionnelle à reprendre ensuite
Terminer d'abord le raccordement `/api/chat` aux capacités réelles de MEL : capability health dynamique, vrais `code.search`/`code.read`, tool loop, réinjection, provenance, archivage sans doublon, bridge ONLINE/OFFLINE.

## Rapport attendu
À la fin, produire : fichiers modifiés, tests pass/fail, preuve du healthcheck, preuve d'un aller-retour request/reply simulé, diff_summary, blockers, next_action.
