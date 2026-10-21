# [Codex] Vérifier l’existant sans inventer un développement

Phase 1 en cours ; phase 2 non commencée.

Le parcours `VERIFY_EXISTING` transformait une preuve fonctionnelle manquante
en `FAILED`. Une absence de Council pouvait également terminer le travail.
Ces deux cas conservaient mal une mission qui demandait une vérification,
pas du nouveau code.

Le runtime conserve maintenant `TEACHER_APPROVED`, le diagnostic et les lectures
réellement tentées dans `verify_existing.status=WAITING_VERIFICATION`. Il réutilise
le report durable existant de cinq minutes : les autres missions peuvent avancer,
et le même travail redevient admissible après échéance, y compris après redémarrage.
La mise à jour conditionnelle préserve les écritures concurrentes ; aucun état
terminal historique n’est réactivé.

Le plan distingue `ALREADY_IMPLEMENTED_UNVERIFIED` et `DEVELOPMENT_REQUIRED`.
`ALREADY_IMPLEMENTED_VERIFIED` appartient uniquement au réconciliateur après
preuve de Council persistée et CI complète sur le SHA exact. Un enregistrement
Teacher externe seul ne peut plus clôturer une vérification sans code.
Un refus réel du Council conserve son comportement de rejet.

Les lectures restent strictes : une erreur d’authentification n’est pas assimilée
automatiquement à une réussite. La branche contractuelle spécifique de
MEL-FOUNDER-01 (erreurs d’authentification exactes, chat sans JSON et sans doublon)
doit encore être démontrée. Aucun `DONE_VERIFIED` de roadmap n’est ajouté.

Régressions : vrai runtime local sans CI exacte, SQLite jetable, reprise MAX,
absence de double admission, concurrence et conservation des états terminaux,
Council indisponible, refus d’une clôture externe non revue. Ces tests locaux
ne constituent pas un Council de production ni une PR autonome créée par MEL.

XP MEL : NON — règles existantes `bootstrap-non-idle-blocker-escape-20260916`
et de preuve réelle conservées, sans doublon. Lot en revue jusqu’à intégration,
déploiement autorisé et validation réelle.
