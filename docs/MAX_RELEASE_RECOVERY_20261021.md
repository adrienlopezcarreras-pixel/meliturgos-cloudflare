# [Codex] Reprise MAX après interruption de release

## Preuves lues le 21 octobre 2026

- Run officiel 39644271604 : completed/cancelled, SHA 66ce41672dea3e19c4dbc7afc594087471684558. Le job deploy a déployé le Worker, vérifié son identité et Workers AI. L'étape de préparation/preuve d'autonomie a été annulée ; restauration MAX, dispatch GEN2-42 et rollback ont été ignorés. Le gate post-release a été ignoré.
- Dernier run officiel réussi précédent : 39627296480, SHA 3ad68a93c30fd865592ad6c533e88e411c8c7831. Ce succès historique ne prouve pas l'état actuel.
- GET production `/api/teacher/launch-readiness` : HTTP 503, `PUBLIC_LAUNCH_READINESS_CACHE_SHA_MISMATCH`, `proof_source=internal-exact-sha-cache`, `expected_sha=66ce41672dea3e19c4dbc7afc594087471684558`, cache `candidate_sha=3ad68a93c30fd865592ad6c533e88e411c8c7831`, `launch_ready=false`, `mutation_allowed=false`.
- GET `/api/gen2/autonomy/control` : HTTP 200, paused=true, max_autonomy=false, status=PAUSED, updated_at=1792604302311. Cette version publique ne fournit ni source/raison ni approbation SHA ; le SHA du cache ne doit PAS être présenté comme la valeur actuelle de `launch_approved_sha` dans D1.
- GET `/api/gen2/autonomy/state` : HTTP 401. Aucun identifiant propriétaire ou Cloudflare injecté ; aucune lecture D1 directe n'est revendiquée. HTTPS API GitHub accessible/authentifié ; API Cloudflare accessible sans authentification (HTTP 400 à la racine API), pas de permission D1 démontrée.
- Liste des 100 derniers runs officiels : aucun run non terminé observé. La vérification des runs actifs doit être répétée avant toute intervention production.
- PR 2295 inspectée : son correctif MAX concerne l'attente du bail runtime, pas la conservation du choix après une release annulée. Aucun contenu de cette PR n'est repris ici.

## Cause et correction

Le workflow restaure MAX uniquement après ses preuves réussies. Une annulation après déploiement doit conserver cette protection. Mais la pause de bootstrap effaçait le souvenir du choix MAX, et le prochain workflow ne capturait que `max_autonomy=false` de l'état suspendu : une nouvelle release vérifiée ne pouvait donc plus distinguer ce choix d'un arrêt volontaire. Le contrôle public omettait aussi les champs nécessaires à cette distinction. L'interface promettait une reprise sans savoir si la release était encore active.

La correction conserve `max_remembered` séparément de l'exécution effective, dans les métadonnées de contrôle déjà existantes. Elle ne crée ni table ni second moteur de reprise. Le binder et le bootstrap préservent la préférence uniquement pour une pause de release reconnue ; une pause propriétaire, un arrêt de sécurité et un rollback restent prioritaires. La capture officielle relit cette préférence après les preuves, y compris lors d'une migration depuis un Worker dont l'ancien endpoint public ne l'exposait pas.

La restauration existante reçoit `release_restore=true`, exige une readiness positive sur le SHA réellement déployé et utilise une écriture conditionnelle : un changement propriétaire concurrent empêche le premier tick. Un rejeu après activation ne relance pas ce premier tick. Le kick GEN2-42 dépend d'une restauration effective. Le bail runtime et la sérialisation GitHub existants ne sont ni supprimés ni forcés. Council, sauvegardes et provenance zéro coût restent inchangés.

Le journal d'issue existant signale `RECOVERY_REQUIRED` pour une annulation, sans mutation D1. L'interface ne prétend plus que toute pause de release implique une mise en production encore active ou une reprise certaine.

## Limite volontaire et reprise autorisée

Une annulation pendant une preuve ne devient jamais une approbation. Ce correctif permet de récupérer le choix MAX lors d'une NOUVELLE release officielle entièrement vérifiée ; il ne réactive pas automatiquement le SHA interrompu, ne relance pas un workflow annulé et ne contourne aucune preuve manquante. Si l'ancienne version a déjà perdu la préférence dans D1, elle ne peut pas être inventée : l'option propriétaire explicite du workflow officiel reste nécessaire.

Après revue/CI de la PR Codex, le propriétaire doit autoriser séparément sa fusion et son déploiement via l'unique workflow officiel. Ne pas lancer cette procédure tant qu'une release est active/en attente. Utiliser la branche release et le SHA complet exact autorisés ; sauvegarde et restauration isolée doivent passer. Si nécessaire et expressément souhaité par le propriétaire, utiliser l'entrée existante `owner_max_autorelease=true` pour réaffirmer le choix MAX perdu. Une pause propriétaire ou de sécurité plus récente est conservée même avec cette entrée.

Ne pas supprimer de verrou ni mettre à jour D1 pour débloquer cette étape. Attendre tous les gates de production, la restauration MAX et le kick GEN2-42. Relire ensuite le contrôle D1 via la route authentifiée et vérifier paused=false, max_autonomy=true, launch_approved_sha égal au SHA servi. Prouver des cycles GEN2-42 qui avancent réellement, un Council réel et l'examen des objectifs roadmap MEL-FOUNDER-01. Aucun de ces résultats de production n'est revendiqué par les tests locaux.

## Validation

Les tests `tests/release-max-recovery.test.mjs` couvrent : succès avec MAX actif/inactif, annulation avant/après déploiement, SHA périmé, bail actif/expiré, restauration concurrente, rejeu sans double premier tick, indisponibilité D1/readiness, pause propriétaire concurrente, arrêt de sécurité, binder réel et séparation préférence/exécution. Les scénarios Actions utilisent le contrat réel du workflow et les transitions réelles SQLite ; ils ne prétendent pas avoir exécuté une annulation de production.

La CI `predeploy-binder-safety-ci` exécute ces tests sur le SHA exact de PR, sans permissions de déploiement. Les contrôles ciblés, syntaxe et bundling sont exécutés localement ; leurs résultats et la CI sont fournis dans la PR. La suite complète n'est pas remplacée par ces contrôles pour une autorisation de release.

Lot : restauration du choix MAX après interruption. Aucun déploiement, aucune activation MAX, aucune mutation de D1/production effectués par Codex. La PR et les commits sont attribués à Codex, pas au Mentor MEL. XP MEL : NON (règles existantes de preuve, de provenance et de pause prioritaire réutilisées).
