# Passation MEL — Claude et Grok — 19 octobre 2026

## Dernier ajout avant transfert — source 576070fb72810f6e4951907c564831a0a8683080

Le propriétaire demande désormais de conserver les corrections dans des PR et de déployer progressivement. Les correctifs supplémentaires suivants sont poussés sur `candidate/codex-restore-proof-diagnostic`, au-dessus des commits décrits plus bas :

- `b7898342`, puis `7dc48c52` : preview éphémère authentifiée, exposant seulement les lectures du vrai binding D1 pour comparer avec l'API directe. Le premier essai 39327680570 a échoué sur l'absence de `rg` dans le runner ; remplacé par `grep`. Nouvel essai 39328206747 en cours. La preview ne possède pas de route de mutation et son nettoyage est armé avant création. **Aucune cause SQLite établie à cet instant.**
- `97eba6d8` : le bootstrap du tick cloud utilise maintenant l'attente de bail de 90 secondes déjà présente dans l'API propriétaire. L'ancienne fenêtre de trois essais sur 40 secondes pouvait échouer avant la fin du bail. HTTP borné à 300 secondes pour laisser l'attente et le vrai tick terminer. 45 tests lease/bootstrap réussis ; ce correctif ne prouve pas encore un cycle complet en production.
- `576070fb` : chaîne images corrigée dans `web.research`, le vrai chat et le renderer. Recherche d'une URL de raster, validation HTTPS/redirections/MIME/magic/taille, proxy image authentifié de même origine ; CSP inchangée. Réponse photo sans dépendance à l'IA, refus précis si aucune image validée. 10 tests images/rendu réussis, dont vrai handler chat et rendu DOM avec transport fixture. Recherche publique réelle via adaptateur curl : portrait Vatican PNG de 950070 octets, URL `https://www.vatican.va/etc/designs/vatican/library/clientlibs/themes/vatican-v2/images/leo-xiv.png`, page actuelle `/content/leo-xiv/fr.html`. Image inspectée visuellement. Preuve locale `public-photo-search-proof.json` ; aucun navigateur de production revendiqué. Le fetch Node direct de l'environnement local a échoué ; l'adaptateur curl est explicitement mentionné dans la preuve.

Suite complète sur ce code : en cours dans `/tmp/mel-final-corrections-full-test.log` (session 38084), aucun résultat final encore affirmé. Syntaxe : `/tmp/mel-final-corrections-check.log` ; build : `/tmp/mel-final-corrections-build.log`. Sécurité runtime sur le SHA source exact : release-eligible. La dernière production connue reste b5bd485e ; aucun nouveau déploiement officiel depuis le second refus a46. Les anciennes phrases « images non corrigées » plus bas décrivent l'état antérieur et sont remplacées par ce paragraphe.

## Réponse au propriétaire

Non, l'ensemble des étapes et de la roadmap n'est pas terminé. Aucun cycle complet d'auto-amélioration en production n'a été validé. Les mécanismes existent, mais une CI verte ou un travail READY_FOR_REVIEW ne prouve pas le cycle demande → code → Council → CI → promotion → release → vérification réelle. MEL ne doit pas être annoncée à 100 %.

Le dernier essai MAX observé sur le Worker b5bd485e, run 39322109332, s'est arrêté après trois `SKIPPED_LEASE_BUSY`, sans progression durable (`advanced=false`). Ce résultat est un échec de l'épreuve, pas une preuve d'autonomie. Ne jamais supprimer le bail pour obtenir artificiellement un succès.

## Versions et autorisations exactes

- Dépôt : `adrienlopezcarreras-pixel/meliturgos-cloudflare`.
- Worker : `https://meliturgos.adrien-lopezcarreras.workers.dev`.
- PR #2293 fusionnée avec autorisation administrateur explicite ; commit de fusion `b5bd485e8971ffc6762229fc1ef9a87c65370c5c` ; source testée `d66ce9ad35357093ccf9e2fcb60af8ddbe778cd7`.
- Release officielle 39317810066 : SUCCESS, contrôles après déploiement compris. Ce commit reste le dernier code effectivement déployé à cette rédaction.
- PR #2294 fusionnée avec autorisation administrateur conditionnelle, après 41 contrôles réussis ; commit de fusion `a46b907a6536a87a2c80afd748713758fbc835b8`, arbre identique à la source approuvée `0ed146c42c05ecd85b48d923429c767ae452175d`.
- `main`, la candidate canonique `candidate/mel-clean-autonomy` et le pointeur `release/mel-hardware-v0.1.0` sont sur a46b907a.
- Release a46, run 39323710727, tentatives 1 et 2 : échec **avant mutation du Worker principal**, sur la vraie restauration SQLite du backup. Aucun déploiement simultané. Ne pas relancer aveuglément.
- Les autorisations administrateur portaient sur les SHA ci-dessus. Toute nouvelle fusion bloquée par REVIEW_REQUIRED doit être présentée au propriétaire sur son SHA exact, une fois le résultat testé et révisable.

## Correctifs intégrés

### #2293 — Mentor, continuité et patrimoine

Propositions Mentor complètes LF/CRLF, refus des enveloppes partielles/doublons/placeholders/diffs, réparation bornée. Époque MAX propagée et lecture impossible refusée. Comparaison du patrimoine sur schémas et lignes entières. Admission durable et idempotente des compétences manquantes, sur les moteurs existants. 829 fichiers de tests locaux réussis ; 24 CI réussies ; sécurité runtime sans vulnérabilité. Cette release est servie.

### #2294 — réconciliation et blocages fonctionnels

Réconciliation de l'historique candidat, roadmap restaurée intégralement ; prototypes Google/CommonJS et autres chemins orphelins omis du résultat, historique conservé. Work utilise de vrais outils enregistrés et expose ses reçus persistés ; les fausses étapes echo/SELECT de secours sont retirées. Catalogue complet des capacités et routage explicite même sans IA disponible. Lectures connectées terminées rejouées depuis l'archive avec identifiant de message ; aucune garantie exactement-une-fois revendiquée pendant une panne avant écriture ou des requêtes concurrentes. Erreurs natives et fallback conservées sans données privées.

Preuves de gratuité renouvelables en D1, dans `dev_bridge_state`, avec les mêmes validations et la même expiration ; renouvellement réel 39322695508 réussi, sans nouveau déploiement Worker. Aucun service payant activé. Restauration réelle du snapshot dans SQLite jetable avant `restoreVerified=true`.

832 fichiers de tests locaux réussis, 0 échec ; syntaxe 1405 modules ; build dry-run et sécurité runtime réussis sur les SHA exacts. La CI complète de la candidate fusionnée 39322897144 a réussi. **Ce lot n'est pas encore servi**, car la sauvegarde bloque la release.

## Blocage prioritaire : export sidecar / SQLite

`release-tools/predeploy-backup-refresh/d1-restore-proof.mjs` exécute les vrais DDL, réinsère les lignes, contrôle contraintes et intégrité, réexporte puis compare toutes les empreintes et le patrimoine obligatoire. Ne pas le désactiver, supprimer les contraintes ou enregistrer un faux `restoreVerified`.

Le runner de a46 masque volontairement le détail SQLite pour protéger les données et retourne `BACKUP_SQLITE_RESTORE_FAILED`. Deux tentatives de release ont confirmé le refus. La cause exacte n'est pas encore établie.

Un diagnostic SELECT-only, sans déploiement et sans écriture D1, a réussi à restaurer la véritable production via **l'API Cloudflare directe** : run 39325837119, commit technique `eb37f08b68358d684304a33907a4117ce253a940`, 103 tables, 139595 lignes ; empreintes source et restauration identiques `23705940cf10d98775fa6eb2f61d82b204b39628f82e37f9479809ada7340242`. Aucun schéma, aucune ligne ni aucun secret publié. La base locale réelle de développement passe aussi (36 tables, 50 lignes).

Le diagnostic sûr indique désormais étape, motif statique, code SQLite et SHA-256 du nom de table, sans message SQL brut. La différence entre transport D1 par binding/sidecar et API directe reste à reproduire pour attribuer l'échec. Le prochain travail est ce diagnostic précis, puis une correction prouvée ; pas un troisième essai sans élément nouveau.

## Travail supplémentaire poussé, non intégré et non déployé

Branche technique unique de clôture : `candidate/codex-restore-proof-diagnostic`, worktree `/workspace/mel-restore-proof-diagnostic`.

- `eb37f08b` : diagnostic privé de restauration et probe SELECT-only dans le workflow predeploy existant ; 12 tests restauration/probe + 11 tests binder réussis.
- `a3eab36e` : cas `connected_reads` dans l'auto-test réel du chat. Demande Gmail + Agenda + Drive au vrai handler propriétaire, vérifie trois reçus, le rejeu sans outils et exactement un tour durable en archive. Il ne publie aucun contenu privé. Le workflow existant `mel-chat-live-selftest.yml` conserve la preuve et vérifie l'identité avant/après. Tests locaux réussis. **Pas encore éprouvé en production.**
- `b8f4e57c` : remise ShardVault indépendante de l'erreur de lecture de la copie locale ; copie lisible différente toujours refusée. `download:true` sur l'endpoint authentifié de reconstruction remet les vrais octets, avec trois fragments exclus et sans lire l'archive locale. RS/chiffrement inchangés. Tests effectifs crypto + RS + transport avec panne R2 réussis, ainsi que les 35 combinaisons de perte ; aucun succès live revendiqué.

Cette branche doit être intégrée et devenir ancêtre de la candidate avant la clôture. Aucun travail concurrent ne doit écraser ces commits. Ne pas publier directement ce worktree en production.

## Preuves de production déjà disponibles, avec leurs limites

Sous `/workspace/.mel-reconciliation/` :

- `persistent-stress-b5bd485e/` : audit réel COMPLETE, 172 contrats valides, 57 capacités exécutées, 115 non vérifiées ou bloquées ; couverture runtime 33,14 %. Le succès du workflow ne signifie pas 172 capacités fonctionnelles.
- `council-b5bd485e/` : 3 réponses indépendantes / 3 modèles, synthèse COMPLETE, rendu réel des deux interfaces. Vérifier séparément le lien persistant d'une décision de code au SHA avant de clôturer FOUNDER04.
- `production-b5bd485e-media/` : 12 capacités multimédias exécutées ; cela ne prouve pas le parcours utilisateur « affiche une photo du pape ».
- `production-b5bd485e-connections/` : connexions vérifiées ; la preuve dit explicitement `capability_execution_not_implied=true`. Ne pas appeler cela une lecture Gmail dans le chat.
- `readonly-restore-eb37f08b.log` : restauration réelle hors D1 via API.
- `release-a46b907a-failure.log` et `release-a46b907a-attempt2-failure.log` : refus avant déploiement.
- `reprise-etapes-3-9.md` : détails et historique des observations ; ses anciennes sections sont historiques et ne remplacent pas ce dernier état.

Le dernier contrôle public de readiness b5 répond 503 `PUBLIC_LAUNCH_READINESS_CACHE_STALE`. L'autonomie publique indique MAX actif. Refaire les lectures à la reprise : ce document n'est pas une sonde live.

## Reste obligatoire

1. Expliquer et corriger le backup réel, sans le contourner. Valider et intégrer le lot ; une seule release officielle, puis contrôles sur son SHA réellement servi.
2. Exécuter le cycle MAX complet sur le même job, au moins deux ticks avec progrès durable et bail libéré. Ne pas confondre l'avancée d'une CI manuelle avec l'auto-amélioration de MEL.
3. Exécuter `connected_reads` sur la version servie ; conserver les codes exacts par connecteur. MANIFEST08 exige cinq messages réellement lus ou l'un de ses codes exacts, pas un statut de compte connecté.
4. Prouver une compétence absente → un seul objectif → diff réel → Council nommé → CI verte → bus unique → reprise de la demande. La chaîne entière n'est pas encore certifiée.
5. Prouver un livrable Work persistant et consultable et sa reprise. Une tâche créée ou un brouillon ne vaut pas livraison.
6. LoRA : même modèle de base, mesure avant/après, absence de régression et `finetune_id` persisté avant activation. Aucun gain ni LoRA actif prouvé ici.
7. Images, demandées en dernier avec les shards : corriger URL de véritable photo → validation binaire/MIME → rendu. CSP actuelle `img-src 'self' data: blob:` bloque les images externes ; le renderer existe. Une page Wikipedia n'est pas une image. La page « Pape » peut renvoyer un emblème. Source Vatican actuelle observée : `/content/leo-xiv/fr.html`, image `/etc/designs/vatican/library/clientlibs/themes/vatican-v2/images/leo-xiv.png`. Ne pas figer le pape courant : vérifier une source fraîche. Aucun correctif images encore poussé à cette rédaction.
8. ShardVault final : épreuve sur version servie, trois fragments rendus indisponibles logiquement (ne pas supprimer les sauvegardes), réception des vrais octets et SHA-256 comparé à l'archive du commit exact, sans lecture locale. Le propriétaire doit détenir **la clé exacte existante et le manifeste signé hors Cloudflare** ; cette détention et une récupération hors Cloudflare ne sont pas prouvées. Ne pas générer une nouvelle clé, ni exposer la clé actuelle par les logs ou artefacts. `RESTORE.md` décrit la procédure.
9. FOUNDER06 reste `BLOCKED_HUMAN` : PC, Android, MINI et autorisations physiques. Ne pas fusionner la PR #2285 (script PowerShell USB observé avec chaîne non terminée et bloc dupliqué), ne pas flasher de matériel.
10. Ne passer VERIFIED que les lignes ayant leur preuve propre. Aucune validation MEL 100 % tant qu'une ligne manque, conformément à MANIFEST10 et aux instructions du propriétaire.

## Reprise technique et sécurité

GitHub et Worker sont accessibles. `gh` utilise le jeton existant ; ne pas demander de nouveau jeton par défaut. Les secrets CF/backup restent dans GitHub Actions, ne pas les extraire par les journaux. Les identifiants Basic réels ne sont pas disponibles dans l'environnement local. Le serveur local existant sur 127.0.0.1:8787 utilise la base d'onboarding et les identifiants de test ; ce n'est pas une preuve du compte propriétaire Google.

Lire `.agents/MEL_OPERATING_MANUAL.md`, `DEPLOYMENT_UNICITY.md`, `XP_PROTOCOL.md`. Réutiliser les moteurs existants. Ne pas superposer de déploiements ; contrôler les runs actifs avant toute mutation production. Chemin officiel unique : `.github/workflows/deploy-cloudflare-release.yml`. Préserver les sauvegardes et les gates.

Dépendances installées : `/workspace/meliturgos-cloudflare/node_modules`, réutilisées par symlink dans le worktree. Wrangler local : `WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=/workspace/.cache/config ./node_modules/.bin/wrangler deploy --dry-run --env="" --outdir /tmp/<dossier>`. Sécurité : fournir `MEL_DEPLOYED_GIT_SHA` égal au vrai `git rev-parse HEAD`, puis `node scripts/runtime-security-gate.mjs --require-release-eligible`. Ne jamais inventer une métadonnée SHA.

XP MEL : OUI pour les leçons déjà intégrées `mentor-complete-proposal-validation-20261019` et `zero-cost-evidence-renewal-without-redeploy-20261019`. Pas de gain LoRA déduit de ces règles. Le passage supplémentaire reste IN_PROGRESS ; son nettoyage/réconciliation/validation et son checkpoint final ne sont pas encore clos.
