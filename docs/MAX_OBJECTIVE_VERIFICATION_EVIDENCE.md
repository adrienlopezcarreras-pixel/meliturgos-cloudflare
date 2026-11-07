# Preuves de vérification et réparation d'une mission

Le refus de MANIFEST-01 sur `47a406f9` était fondé : le Council recevait
`autonomy.status: OK (5 éléments)` et des chemins de tests inventés par le plan.
Cette agrégation ne démontre pas les critères métier. Une lecture générique ne
peut pas remplacer une recette spécifique aux autres contrats roadmap.

Les recettes sont désormais liées à un objectif précis et à des noms de cas
réels. Le producteur de preuves existant ajoute au même artifact GitHub les
fichiers et cas effectivement réussis dans leur bloc du journal complet. Le
lecteur réutilise ses contrôles de run, branche, SHA, archive, digest et relance.
Les garde-fous FOUNDER-01 restent obligatoires. Une ancienne pièce sans les
cas propres à l'objectif est insuffisante ; aucun modèle ne peut les déclarer.

Le reçu fonctionnel de MANIFEST-01 contient les cinq identifiants canoniques,
statuts, indicateurs de preuve, attentes externes et compteurs observés, ainsi
que le SHA réellement déployé. Les valeurs des indicateurs métier, le contrôle
et les travaux privés sont exclus. Les tests montrent la séparation données /
priorités, les reçus logiciels acceptés et le matériel encore non vérifié.
La proposition du modèle reste visible comme proposition, séparée des reçus.

Un nouveau refus d'une mission autonome passe en `REPAIR_REQUIRED`, conserve
les objections et réserve le chemin de réparation existant. La prochaine
proposition doit corriger le code ou les tests : le même `VERIFY_EXISTING` est
refusé. Un paquet de preuves rejeté ne devient pas une empreinte de code rejeté.
Les demandes directes du propriétaire conservent leur traitement indépendant.

Une vérification rejetée reste rejetée. Seule la mission actuellement retenue
pour réparation peut être remise en planification après déploiement d'une
nouvelle révision effective du format qui corrige les preuves manquantes. Cette
reprise consomme le budget existant, est unique par révision, conserve le veto
et les compteurs, respecte arrêt propriétaire / annulation / CAS et ne crée
aucune autre mission. Le Teacher, les lectures, les tests et le Council votent
à nouveau ; aucune clôture n'est attribuée par la reprise. Code et preuves
inchangés, autres échecs et plafond atteint restent bloqués.

L'interface distingue plan Teacher approuvé et preuves refusées par le Council.
Les listes légères conservent seulement les identifiants de corrélation ; elles
omettent les prompts et archives complets, toujours disponibles par lecture
individuelle autorisée.

Ce lot doit passer sa CI exacte, sa revue Council et sa release avant de pouvoir
certifier MANIFEST-01. Respecter aussi `WORKERS_AI_DEPRECATION_20261106.md` pour
les modèles et déploiements ; aucun quorum ni contrôle de coût n'est modifié.


## Tous les points de la roadmap

Le catalogue d’activité utilise la même vérité D1 récente que MAX, pas les anciens statuts déclarés. Une recette sûre existante donne une mission `VERIFY_RUNTIME`. Une recette absente ouvre un lot auxiliaire `ROADMAP-PROOF-<ID>` avec fichiers, régression, prérequis et interdiction du no-op; le parent attend sa vérification réelle. Livrer ce lot ne valide ni le parent ni un appareil physique. Ces missions partagent le créneau unique et les budgets existants. La sonde de production conserve son ancien nom de fichier pour compatibilité, mais vérifie les identifiants et la révision du registre courant.

Les reçus logiciels indépendants restent utilisables pour les prérequis de développement. Ils ne masquent pas une recertification manquante, y compris pour un objectif déjà livré dont le registre est encore `PLANNED`. Une régression explicite conserve son autorité.

Une recertification acceptée débloque immédiatement ses dépendants, sans attendre un cycle supplémentaire de lecture de la vérité runtime.
