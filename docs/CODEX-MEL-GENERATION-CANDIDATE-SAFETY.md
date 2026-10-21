# Réparation Codex : génération autonome et sûreté candidate

## État revérifié et attribution

`main` : `f5d5126cec5fd619d3ac9110e4cef552ded7656e`. Le commit candidat `43f1742c2269357357c2b563291f2a8df26074cd`, parent `f5d5126…`, est attribué à « MEL Cloud Dev Bridge », `mel-cloud-bridge@localhost`, daté du 21 octobre 2026 à 21:02:51 UTC. Il n'est pas signé. Son message corrèle `mel-autonomy-mel-founder-02-e1792615353403-1`. Cela établit une publication par le pont, pas le modèle Mentor utilisé : les reçus authentifiés D1 et les sorties fournisseurs ne sont pas accessibles à cette machine. Aucune provenance de modèle n'est inventée.

Ce commit remplace `src/work/work-dag.js` (316 lignes retirées, 13 ajoutées, résultat de 19 lignes). Il conserve seulement `createWorkDag` et supprime les exports `WORK_DAG_STATUS`, `WORK_NODE_STATUS`, `verifyWorkDag`, `validateWorkDag`, `DevJobWorkDagStore`, `createAugmentioWorkExecutor`, `WorkDagRunner`. Il perd les vérifications d'intégrité, cycles/dépendances, corrélations SHA, stockage/checkpoints, reprise idempotente, refus des opérations non idempotentes interrompues et validation Teacher. Sa boucle met des nœuds AUGMENTIO en RUNNING avant exécution : ce n'est pas une contribution fonctionnelle à conserver. Le code antérieur possède déjà une reprise persistante et bornée. Les tests existants `work-dag-state` et `work-dag-resume` échouent immédiatement sur le commit défectueux (exports absents) et passent sur la base saine (7 tests).

CI `39675537239` : échec de `Full test suite` sur `43f1742…`. La candidate a ensuite avancé par `4db521ab59c45733f56db32751ab5c15bd5ab53f` (MEL-FOUNDER-03, helper ajouté dans autonomy-supervisor) ; sa CI `39677772664` est aussi rouge. La PR conserve ce commit concurrent. La réparation du DAG est écrite par **Codex**, attribuée comme telle et ne vaut ni réussite autonome MEL ni DONE_VERIFIED.

## Réutilisation et causes démontrées

- PR #2329 réutilisée par ascendance : même protocole `edits`, mêmes extraits bornés, budgets, délais fournisseurs, réparation structurée et repli cloud. Aucun deuxième Mentor ni deuxième scheduler.
- PR #2352 examinée : ses améliorations UI/proofs restent dans sa PR. Son lecteur GitHub authentifié et borné est repris à l'identique dans le même helper existant, utilisé aussi pour les CI rouges. Aucun lecteur parallèle. Les deux PR doivent être réconciliées à la revue si l'ordre d'intégration change.
- PR #2353 examinée : contrôle du Dev Executor Windows, hors de ce lot. Aucun PC requis ici.
- Un fournisseur pouvait recopier `reason = Modification appliquée sur le fichier inspecté` pour contourner le refus des fichiers longs. La preuve d'application est maintenant un booléen produit dans le validateur, jamais un champ modèle.
- Les fichiers complets servaient à appliquer les edits mais le validateur ne liait pas le `find` à l'extrait effectivement transmis au fournisseur. Chaque réponse est désormais validée contre son propre périmètre visible, y compris lors de la réparation.
- Pas de vérification de syntaxe/exports/contrats de classes dans la proposition. Un parseur JavaScript épinglé (`acorn`) refuse les exports et méthodes publics perdus ; les tests complets restent indispensables pour les comportements. Une évolution autonome supprimant une API existante est volontairement refusée et exige une revue distincte.
- Le littéral de masquage `'[TRUNCATED]'` du vrai DAG était pris pour du code omis. Seul un littéral déjà présent dans une source réellement lue peut être conservé ; les nouveaux marqueurs d'omission restent refusés.
- Une publication suivie d'une CI rouge restait READY_FOR_REVIEW sans nourrir le réparateur existant. Le heartbeat actif réconcilie maintenant la CI exacte vers REPAIR_REQUIRED, avec preuve de run, SHA et base du paquet. Aucun traitement de réparation n'est ajouté derrière le verrou de lancement.
- Les CAS mémoire pouvaient comparer un ancien objet après un await concurrent. La comparaison mémoire est synchrone ; les transitions de révision Teacher et de réparation utilisent explicitement leur snapshot. Un conflit est conservé comme conflit, sans écrasement ni succès fictif.

## Contrat conservé

Lecture complète au SHA approuvé, refus des fichiers trop grands plutôt que troncature de la source d'application, contrôle du HEAD après inference et CAS avant persistance. Chemins non lus, imports cassés, propositions partielles, délais dépassés, autorisation SHA périmée et refus Council restent bloquants. Le code analysé n'est jamais exécuté par le validateur de proposition. JavaScript `.js`/`.mjs` reçoit le contrôle AST ; les autres formats restent soumis aux contrôles existants et à la suite complète.

Le paquet contient obligatoirement `test`. Le pont cloud impose aussi cette commande aux anciens paquets qui ne demandaient qu'un smoke. Il refuse une candidate devenue obsolète avant application ou publication ; aucun rebase automatique après les tests ne réutilise leur preuve sur un arbre différent. Le push reste non forcé. Les paquets en cache sont relus et revalidés avant réutilisation.

Une CI verte ne suffit toujours pas à COMPLETED : exact-SHA, provenance et Council restent obligatoires. Une décision VERIFY_EXISTING conserve le chemin de preuves sans code, jamais un paquet inutile. Aucun verrou, statut de mission ou état de production n'est modifié par ce travail de dépôt.

## Réparation après CI rouge

Seuls les travaux READY_FOR_REVIEW, Teacher corrélé et paquet publié, sont éligibles. Lecture des runs full-candidate-ci sur le SHA publié ; pending, succès, annulation et mauvais SHA/branche ne déclenchent pas de réparation. Une avancée de candidate est admise uniquement avec preuve GitHub d'ascendance et absence de modification des fichiers concernés (comparaison tronquée refusée). Sinon la panne reste non attribuable à la candidate actuelle et n'est pas appliquée aveuglément.

Le circuit existant REPAIR_REQUIRED → nouvelle revue si SHA périmé → Teacher/Mentor → paquet est conservé. Les fichiers du paquet en échec sont prioritaires dans la nouvelle inspection ; le planner ne les reprend que si la revue Teacher renouvelée les a effectivement lus, sans élargir son périmètre. Le Mentor reçoit, en contexte historique distinct, les sources réellement relues au SHA de base du paquet défectueux ; ses edits ciblent la candidate actuelle. Les contrats de la candidate et de cette référence doivent tous deux être préservés. Une référence absente ne devient pas un fichier inventé. La preuve initiale et les autres missions sont conservées ; CAS et statut empêchent le double traitement.

## Validation et reprise

Les régressions couvrent le vrai contenu défectueux de 43f1742, justification forgée, suppression d'exports/méthodes, syntaxe invalide, fichier/extrait non visible, proposition invalide, délais fournisseurs et repli, marqueur légitime contre omission, CI rouge/pending/verte/annulée, mauvais SHA/branche, erreur HTTP, réparation structurée avec référence, cache ancien, HEAD avançant durant inference, conflit CAS, deux réconciliations simultanées, autre mission conservée, SHA Teacher périmé et objectif déjà implémenté sans génération. Les tests utilisent des fournisseurs contrôlés : ils ne prouvent aucune réponse de production.

Le test du workflow Linux exécute réellement syntaxe, tests de comportement et push sur un dépôt Git nu jetable, sans PC ni réseau de production ; une avancée concurrente doit être préservée et le paquet refusé.

Après revue : intégrer le lot candidat exact, exiger full-candidate-ci et les gardes de promotion sur ce nouveau SHA ; toute release nécessite l'autorisation propriétaire. Après mise en production autorisée seulement, observer la mission existante (sans purge), le vrai nouveau résultat Mentor, les tests, le SHA publié et la PR autonome. Vérifier les reçus Teacher/Mentor/bridge et la décision Council réelle. Ne compter aucune restauration Codex comme succès MEL. Tant que ces preuves n'existent pas, la mission autonome reste non vérifiée.

XP MEL : NON — règles de validation complète, preuve corrélée et préservation concurrente déjà présentes dans le corpus ; aucun doublon ajouté.
