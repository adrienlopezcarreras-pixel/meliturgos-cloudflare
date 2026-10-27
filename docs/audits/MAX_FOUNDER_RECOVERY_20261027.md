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

## Diagnostic et passage ciblé

Le diagnostic manuel protégé existant lit maintenant les trois missions FOUNDER-01 les plus récentes et l’expiration du bail par SELECT constant, sans code, courrier ou texte propriétaire. 11 tests de lecture seule/sanitation passent.

Le workflow GEN2-42 accepte `only_job_id` transmis comme JSON, validé après authentification. Ce mode conserve pause/approbation/lease, ne crée pas de nouvelle mission, limite l’approbation MAX à cette mission et désactive les développements supplémentaires ainsi que les dispatchs automatiques. Il produit un reçu pour inspection avant l’étape suivante. La durée HTTP passe à 420 secondes pour couvrir l’attente de bail (90 s) et le tick (240 s). 59 tests bootstrap, générations d’activité et lease-contract passent ; annulation et mission indépendante restent intactes.

La suite locale initiale a terminé avec 950 fichiers réussis, zéro échec ; les ajouts suivants disposent des tests ciblés ci-dessus et exigent la CI du SHA final.

## Limites et prochaine preuve

Aucune modification D1, aucun nettoyage, aucune reprise MAX ni mission déclenchée par ce passage. Le journal propriétaire montre un ancien paquet syntaxiquement valide mais avec deux fichiers de tests en échec ; les refus historiques Council portent sur de vraies preuves manquantes Gmail/Agenda/Drive, présentation sans JSON et absence de doublon. Un succès technique du pipeline ne remplace pas ces critères.

Le test de production doit cibler uniquement la mission courante, préserver les CANCELLED et les preuves historiques, enregistrer les identifiants de commandes PC, le SHA du paquet et de la candidate, les tests, le verdict Council et le déploiement exact. L’accès authentifié de production/PC n’est pas disponible dans cet environnement ; aucun parcours complet ne peut être déclaré prouvé ici. Ne pas attribuer LEASE_BUSY à un verrou abandonné sans lecture du propriétaire et de son expiration.

XP MEL : NON — règles de preuves exactes, report et distinction déploiement/validation déjà présentes dans le corpus.
