# MAX / MEL-FOUNDER-01 — corrections et preuves

Base inspectée : f560d7fc8dbe21086c2843bbd0570bc04023baeb. Production observée : 98748c6eaeccf7cf8098356634e2fad0d7060eeb ; contrôle public actif.

## Causes et périmètre

- Passage ciblé `onlyJobId` : la réconciliation CI est sautée mais ne fournit pas `repaired`. La lecture finale de `.length` lève exactement le TypeError communiqué. Le test du vrai runtime échoue avant correction à autonomy-runtime-core.js:1001 puis passe avec le résultat vide cohérent.
- Council : les délais de 45 secondes étaient renouvelés à chaque fournisseur de secours puis pour la synthèse. Un budget partagé de 180 secondes maximum borne désormais ces appels ; aucun nouvel appel de secours après expiration. Cela ne prétend pas annuler une inférence déjà envoyée, ni garantir que toutes les autres étapes d’un tick tiendront dans ses quatre minutes.
- Reprise : `COUNCIL_INSUFFICIENT_RESPONSES` manquait aux reports fournisseurs. Cette indisponibilité conserve maintenant la mission QUEUED avec report de cinq minutes, sans consommer le compteur d’échecs runtime. Les preuves insuffisantes et les SHA périmés restent refusés.

## Vérifications

- Reproduction du TypeError avant correction : échec observé du test ciblé.
- 48 tests initiaux verts : runtime, lease, attente de vérification, réponses Teacher et les deux fichiers de tests signalés par le propriétaire.
- 40 tests Council/runtime/attente verts après ajouts : fournisseurs silencieux, synthèse silencieuse, report persistant de la même mission. Tous les fournisseurs sont simulés, aucune inférence Cloud.
- Suite complète et syntaxe : résultats à lire dans les journaux de validation, pas encore revendiqués ici.

## Watchdog après timeout

Le timeout renvoyait une progression sans inventaire : le watchdog la normalisait en `work_remaining:false` et affichait IDLE malgré la file active. Il relit maintenant l’inventaire courant sans mutation et conserve le motif timeout. Une régression avec fournisseur bloqué prouve mission QUEUED, compteur bloqué incrémenté et NO_PROGRESS, sans prétendre annuler le callback déjà engagé.

## Diagnostic et passage ciblé

Le diagnostic manuel protégé existant lit maintenant les trois missions FOUNDER-01 les plus récentes et l’expiration du bail par SELECT constant, sans code, courrier ou texte propriétaire. 11 tests de lecture seule/sanitation passent.

Le workflow GEN2-42 accepte `only_job_id` transmis comme JSON, validé après authentification. Ce mode conserve pause/approbation/lease, ne crée pas de nouvelle mission, limite l’approbation MAX à cette mission et désactive les développements supplémentaires ainsi que les dispatchs automatiques. Il produit un reçu pour inspection avant l’étape suivante. La durée HTTP passe à 420 secondes pour couvrir l’attente de bail (90 s) et le tick (240 s). 59 tests bootstrap, générations d’activité et lease-contract passent ; annulation et mission indépendante restent intactes.

La suite locale initiale a terminé avec 950 fichiers réussis, zéro échec ; les ajouts suivants disposent des tests ciblés ci-dessus et exigent la CI du SHA final.

## Limites et prochaine preuve

Aucune modification D1, aucun nettoyage, aucune reprise MAX ni mission déclenchée par ce passage. Le journal propriétaire montre un ancien paquet syntaxiquement valide mais avec deux fichiers de tests en échec ; les refus historiques Council portent sur de vraies preuves manquantes Gmail/Agenda/Drive, présentation sans JSON et absence de doublon. Un succès technique du pipeline ne remplace pas ces critères.

Sur instruction explicite ultérieure du propriétaire, le test de production doit cibler le job original `mel-autonomy-mel-founder-01-e1793054144390-1`, restauré volontairement après son annulation. La suppression demandée concerne uniquement `mel-autonomy-mel-founder-01-e1793099063810-1`. Les autres annulations et preuves historiques restent conservées. Il faut enregistrer les identifiants de commandes PC, le SHA du paquet et de la candidate, les tests, le verdict Council et le déploiement exact. L’accès authentifié de production/PC n’est pas disponible dans cet environnement ; aucun parcours complet ne peut être déclaré prouvé ici. Ne pas attribuer LEASE_BUSY à un verrou abandonné sans lecture du propriétaire et de son expiration.

XP MEL : NON — règles de preuves exactes, report et distinction déploiement/validation déjà présentes dans le corpus.


## Périmètre propriétaire final — quatre points

- Admission atomique D1 et mémoire : un seul job actif par objectif `mel-autonomy`, indépendamment de son identifiant ou de la génération d’affichage ; les annulations ne sont pas réactivées implicitement.
- Plafond global partagé de trois travaux actifs `revenue-watch`, protégé dans la même instruction SQL que l’admission, pas trois nouveaux travaux par passage. Un dépôt GitHub et une récompense textuelle sans reçu de financement fournisseur ne déclenchent ni développement ni demande de compte.
- Reproduction sur `result_json` réel : workflow manuel propriétaire existant, lecture D1 fixe du job original et exécution avant/après en mémoire avec dépendances locales simulées. L’ancien core provient exactement du SHA 58fbda579223a3e1b47d18715a940110e3ed47da. L’artefact n’expose que le digest de l’état et les résultats ; aucune donnée du job ni appel IA réel. Cette preuve reste à exécuter après intégration ; les fixtures locales ne sont pas présentées comme des données D1 réelles.
- Récupération propriétaire distincte : exige une release exacte réussie, le SHA approuvé dans le contrôle, un verrou de maintenance existant et le drainage du bail. Sauvegarde originale+doublon+file revenus dans D1 et relecture avant suppression ciblée, puis reprise de l’original QUEUED avec reçu propriétaire de génération ; création initiale, tests et correctif conservés. Aucun faux plan approuvé ni CI verte. Une interruption après suppression est reprise à partir de la sauvegarde sous le même verrou.
- 118 tests étendus initiaux verts ; 31 tests admission/lecture/revenus verts ; 13 tests propriétaire/rejeu/veille verts. CI complète du lot final, reproduction D1, release et preuve CI du vrai job encore à obtenir.

Le relancement MAX après release verte est désormais explicitement autorisé par le propriétaire. Aucune allocation supplémentaire de neurones n’est autorisée par ce lot.


## Inspection GitHub après le Council

Le segment historique `council-teacher` englobait aussi l’inspection GitHub. Son reader n’avait aucun timeout HTTP. Le lot borne désormais l’inspection entière (entêtes et corps compris) à 45 s, annule les requêtes via AbortController et interdit de lancer les suivantes après l’expiration ; une lecture silencieuse ne peut pas produire un Teacher tardif. `CODE_INSPECTION_TIMEOUT` utilise le report persistant, pas une validation partielle. Marqueurs distincts : council-models, code-inspection, teacher-request. 50 tests runtime/reprise/vérification passent, avec un transport GitHub qui ne répond jamais.

Baseline de production authentifiée en lecture seule : run40504033560 SUCCESS, trois échantillons ; doublon QUEUED/COUNCIL_INSUFFICIENT_RESPONSES, original CANCELLED/REPAIR_REQUIRED conservé, deux baux successifs observés. Le marqueur historique seul ne permet pas d’attribuer l’abandon de 11:15 à un modèle spécifique.
