# [Codex] Autonomie : preuves corrélées et diagnostic de lecture CI

La release officielle 39667357828 est vérifiée SUCCESS sur f5d5126cec5fd619d3ac9110e4cef552ded7656e. Le contrôle public indique MAX_AUTONOMY, paused=false, max_autonomy=true. La readiness publique est GO sur ce même SHA. Ces lectures ne prouvent pas qu'un objectif roadmap avance.

Le relais github-action-relay 39670126980 est observé dans sa boucle normale de surveillance (jusqu'à 50 minutes), avec un successeur en attente. Cela ne prouve pas le dispatch d'un paquet particulier. La liste des workflows gen2-42-apply-ready-bridge n'expose aucune exécution depuis celle du 21 octobre à 09:34 UTC. Aucune nouvelle application cloud n'est donc démontrée par cette liste au moment de la lecture.

Le propriétaire a ensuite confirmé avoir utilisé « Vider la liste ». Les 19 travaux décrits avant cette action, dont mel-autonomy-mel-founder-07-e1792579058089-3, ne sont plus un état courant présumé. Aucun ancien travail n'est restauré par cette correction. La lecture authentifiée du travail et du flux Activité répond HTTP 401 avec les accès de cette machine. Le nouvel epoch d'activité, les nouveaux jobs, leurs claims, leurs erreurs et leurs reçus de relais ne sont donc pas observés directement en D1. Les téléchargements de preuves Actions sont également refusés par le réseau vers le stockage d'artefacts ; ni leur contenu ni un résultat de Mentor/Council n'est inventé.

## Défaut reproduit et correction limitée

Avant correction, jobPipeline({status:'CLAIMED', result_json:{}, files_json:[], tests_json:[]}) affichait « Plan validé », « Code écrit » et « Paquet prêt » comme acquis. Le statut CLAIMED seul n'identifie pourtant ni l'exécuteur ni son activité. implementation_proposal READY décrit un plan d'implémentation, pas les modifications générées par le Mentor.

Le pipeline exige maintenant une revue Teacher corrélée, le paquet structuré existant contenant les fichiers et les tests, ainsi que la concordance de son SHA et de sa demande Teacher avec le plan. L'application cloud demande un reçu de publication, et la complétion une preuve de CI exacte du reconciler existant. Le statut COMPLETED seul ne remplace plus ces preuves. Un objectif validé sans nouveau code est présenté comme code existant vérifié, sans lui attribuer une génération Mentor. La mention de fin ne prétend plus prouver une release de production.

Le changement de pipeline porte uniquement sur la lecture et la présentation des preuves : aucun scheduler, claim, bail, statut D1, coût, garde Council ni chemin de publication n'est modifié. Il ne débloque pas à lui seul un exécuteur réellement arrêté et ne prétend pas rendre MEL autonome de bout en bout.

## Après le vidage de liste

Les tests existants du reset et de l'epoch sont exécutés : annulation conservée, anciens jobs exclus de la reprise, nouveaux jobs admis à partir du nouvel epoch, aucun réveil d'un travail annulé par un ancien callback. Ce sont des preuves locales ; elles ne prétendent pas observer la D1 réelle après le clic propriétaire.

Pour poursuivre le diagnostic opérationnel, il faut une lecture autorisée de l'état courant : epoch, nouveau job id/status/updated_at, diagnostics Mentor et préparation, reçu de claim/exécuteur, identifiant de relais et run GitHub corrélé. Aucun secret ni contenu privé de l'objectif n'est nécessaire dans le chat. Sans ces preuves, réattribuer l'ancien CLAIMED ou annoncer que le reset a réparé le problème serait injustifié.

Validation ciblée : tests du pipeline, des claims, de l'epoch et des callbacks après annulation, étendus dans la CI Professor existante. La PR est Codex, pas une PR de code généré par le Mentor MEL. Aucune fusion, release, activation MAX ou mutation de production effectuée par Codex. XP MEL : NON (règles existantes de séparation des niveaux de preuve réutilisées).


## Nouvelles captures après reset et preuve CI existante

Les captures propriétaire suivantes décrivent un NOUVEAU travail MEL-FOUNDER-01, TEACHER_APPROVED, avec FULL_CANDIDATE_CI_REQUIRED, puis deux travaux actifs et AUTONOMY_RUNTIME_LEASE_BUSY. Elles remplacent le diagnostic de l'ancien CLAIMED. Un cycle sauté parce qu'un bail est occupé ne prouve pas un bail durablement bloqué ; aucun bail n'est effacé ou réattribué ici.

L'API GitHub confirme que full-candidate-ci 39658559476 est déjà SUCCESS sur f5d5126cec5fd619d3ac9110e4cef552ded7656e, branche candidate/mel-clean-autonomy, événement push. Il ne faut pas relancer cette CI pour produire un doublon. Le SHA exact du plan du nouveau travail reste à lire : le SHA autorisé affiché ne suffit pas à le déduire.

Le runtime transformait toute erreur findGreenFullCandidateRun en null, donc en FULL_CANDIDATE_CI_REQUIRED. Un HTTP 403, une panne réseau ou une réponse malformée étaient ainsi indiscernables d'une absence de CI. La consultation n'utilisait pas MEL_GITHUB_TOKEN, même configuré pour les autres lecteurs GitHub.

La correction réutilise ce binding existant lorsqu'il est disponible, uniquement vers l'URL API GitHub construite par le lecteur. Les redirections sont refusées et la requête est bornée. Les erreurs de consultation restent bloquantes mais deviennent FULL_CANDIDATE_CI_LOOKUP_FAILED (avec statut HTTP lorsqu'il est connu) ; FULL_CANDIDATE_CI_REQUIRED reste réservé à une réponse exploitable sans run vert correspondant. Les conditions exactes SHA/branche/état/conclusion ne sont pas assouplies et le Council réel reste obligatoire. Aucun token n'est créé ou demandé dans le chat.

Ce défaut de diagnostic est reproduit et testé. Sans la lecture authentifiée du plan/diagnostic courant ou un essai du runtime corrigé après déploiement autorisé, il n'est pas présenté comme la cause opérationnelle unique de la capture. Aucun résultat Gmail, Agenda, Drive, Council ou génération Mentor n'est déclaré vérifié. Les tests couvrent aussi la réutilisation d'une CI verte existante, les refus HTTP/transport et la conservation du refus sur mauvais SHA ou mauvaise branche.
