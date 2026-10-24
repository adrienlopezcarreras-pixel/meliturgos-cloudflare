# Feuille de route d’exécution : chat MEL professionnel

Établie le 24 octobre 2026. Objectif : comprendre la demande, agir avec les outils autorisés, puis fournir une réponse utile et des médias réellement consultables. Le niveau attendu se mesure par les résultats, les preuves et les erreurs correctement traitées.

La source unique des objectifs et de leur statut est la phase P18 de `src/roadmap/master-roadmap.js` : MEL-CHAT-01 à MEL-CHAT-08. Ce document décrit l’ordre de travail, les critères de recette et les limites connues. Les critères Gmail/Agenda/Drive de MEL-FOUNDER-01 et les contrôles Teacher/Council sont conservés. MAX est traité dans son chantier existant.

## Comparaison fonctionnelle avec l’assistante de cette session

La comparaison porte sur des capacités observables, sans prétendre copier des poids, un raisonnement interne ou un niveau global de modèle. Aucun test comparatif réel ne permet encore d’affirmer une parité générale. La qualité dépend aussi du modèle, de son contexte et de ses quotas.

| Dimension | Observable dans cette session | État étayé de MEL et objectif |
| --- | --- | --- |
| Comprendre et corriger une demande | Les corrections de l’utilisateur réorientent le travail ; les contraintes sont conservées | Classifieur contrastif livré ; mesurer le vrai modèle sur demandes implicites, ambiguës, multiples et corrigées |
| Répondre clairement | Réponses rédigées, explications et limites reliées aux preuves | Prompts et garde qualité existants ; vérifier pertinence, profondeur, synthèse et absence de JSON technique non demandé |
| Agir avec des outils | Lectures réelles, commandes, tests et opérations GitHub autorisées tracés | CapabilityBus existant ; chaque appel doit produire un résultat ou une erreur exacte, puis être utilisé dans la réponse |
| Lire et diagnostiquer le code | Dépôt réellement inspecté, régressions reproduites et tests exécutés | PR #2507 : recherche puis lecture par lignes, référence fixée, continuation en lecture seule et contrats réels ; recette modèle réel encore requise |
| Chercher des sources | Sources officielles effectivement récupérées par HTTPS ; certains sites sont bloqués | Recherche web et sources existent ; ne citer que des pages réellement obtenues et ne pas confondre titre, URL et contenu analysé |
| Images et médias | Images jointes accessibles dans la conversation ; lecteurs vérifiés dans Chromium avec fixtures identifiées | 12 moteurs existants ; prouver le parcours demande → provider → résultat → rendu → stockage → reprise, y compris les erreurs |
| Mémoire et contexte | Historique courant et rapport de reprise explicite | Archive et mémoire de MEL existent ; vérifier la pertinence du rappel, la dernière correction et la protection des données privées |
| Connecteurs | Aucun accès Gmail/Agenda/D1 de production n’est directement prouvé dans cette session | Des connecteurs MEL existent ; relire leur état autorisé et tester une lecture réelle ou son erreur précise, sans simuler une connexion |
| Évaluer la qualité | Tests logiciels et CI réels ; aucun score général d’intelligence revendiqué | Séparer routage, outils, réponse du modèle, disponibilité des services et rendu ; publier les résultats par scénario |

## Ordre d’exécution

### 0 — Mesurer et préserver le socle déjà livré

Rattachements : MEL-CHAT-01/02/03/04/06.

Conserver les corrections #2491/#2499 (outils, streaming, archive et rendu), #2502 (objet média demandé), #2503 (analyse vidéo partielle) et #2507 (diagnostic et contrats). Conserver les corrections de GPT normal sur la localisation et la lecture des sources, les snapshots immuables et leurs garde-fous. Vérifier leurs tests avec l’environnement canonique ; ne pas les réécrire en parallèle.

Produire un relevé exact : version, modèle, statut du provider, appel exécuté, réponse, média obtenu, preuve navigateur et erreur éventuelle. Les fixtures locales ne valent pas preuve de provider ou de modèle en production.

### 1 — Compréhension : décider correctement avant d’agir

Rattachements : MEL-CHAT-01 et MEL-CHAT-08.

Prochain lot concret : distinguer un appel d’outil, un exemple documentaire et des données JSON ordinaires. Un objet `name` ou `capability` descriptif ne doit pas être supprimé ou exécuté par erreur. Réutiliser le parseur canonique dans les audits, sans deuxième détecteur contradictoire.

Étendre ensuite le corpus : expliquer, rechercher, générer, analyser une pièce jointe, demander une précision, traiter plusieurs sous-demandes et appliquer la dernière correction utilisateur. Les résultats externes restent des données, jamais des ordres à suivre. Les demandes de diagnostic restent en lecture seule.

Recette minimale :

- « Montre les différences entre une photo et une vidéo » : expliquer sans recherche de média.
- « Peux-tu me montrer trois photos de chats » : recherche réellement exécutée et trois résultats ou limite explicite.
- « Montre le code pour afficher une vidéo » : traiter la demande de code.
- « Explique pourquoi MAX bloque » : lire le statut pertinent, sans déclencher de cycle.
- « Analyse cette vidéo jointe » : utiliser les données réellement analysées ou dire précisément ce qui manque.
- « Donne un JSON avec name et age » : conserver les données demandées.
- « Donne un exemple d’appel code.read » : montrer l’exemple sans l’exécuter.
- Une correction utilisateur récente remplace une hypothèse issue d’un ancien tour.

### 2 — Réponses : pertinence, raisonnement utile et contexte

Rattachements : MEL-CHAT-07 et MEL-CHAT-06.

Faire commencer la réponse par ce qui résout la demande. Ajuster le détail et la forme au besoin ; fournir une justification et les preuves utiles. Préserver les contraintes et décisions dans le contexte borné. Sélectionner les souvenirs pertinents ; ne pas injecter tout le journal ni laisser une ancienne instruction détourner le sujet courant.

Séparer recherche des documents et qualité de la réponse : un bon résultat de recherche peut être mal synthétisé, et une réponse élégante peut être sans preuve. Comparer les variantes de prompt et les modèles déjà gratuits/autorisé par tâche, avec le même corpus et la même version. Garder le routeur existant et son budget ; aucun abonnement ou modèle payant ajouté.

Recette : réponse directe, toutes les sous-demandes traitées, profondeur suffisante, aucune citation inventée, incertitudes précises, aucune réalisation annoncée sans preuve, source récente pour les faits qui peuvent avoir changé. Ne pas conclure « incapable » lorsqu’un outil disponible a seulement échoué cette fois.

### 3 — Multimédia réellement utilisable

Rattachements : MEL-CHAT-02 et MEL-CHAT-03.

Vérifier séparément réception, analyse, génération/recherche et restitution. Conserver un contrat `media/references` unique. Tester images, son, vidéo et documents dans le navigateur réel, avec MIME, auth, lecture, déplacement temporel, chargement et erreur. Rejouer stockage, rechargement et interruption sans perdre les médias ni dupliquer l’action.

Priorité d’entrée : image décrite et audio transcrit par le serveur, puis vraie vidéo jointe échantillonnée dans les limites déjà autorisées. Le parcours des vidéos jointes n’est pas déclaré fonctionnel par la seule existence de media.video.analyze. Décrire les images réellement extraites et le segment traité ; un échec audio conserve un résultat visuel partiel explicite. Un titre ou une miniature ne prouve pas le contenu.

Priorité de sortie : photo trouvée avec source, audio réellement lisible, vidéo réellement lisible, document récupérable. Distinguer moteur procédural, animation de frames et génération IA. Indiquer une limite réelle du provider au lieu d’inventer un fichier. Les clés privées, la rétention et les coûts zéro sont préservés.

### 4 — Code : recherche pertinente et diagnostic étayé

Rattachements : MEL-CHAT-04 et MEL-CHAT-05.

Lot déjà engagé : retrouver un symbole au-delà des premières documentations sans dépasser 24 lectures ; signaler fichiers échoués, gros fichiers sautés, arbre tronqué et recherche incomplète. Conserver les interfaces et contrôles de GPT normal.

Puis tester le diagnostic inter-fichiers : localiser le chemin utilisateur, lire fonctions et appels pertinents par plages, identifier la cause étayée, distinguer les hypothèses et proposer la vérification suivante. Citer uniquement les fichiers, lignes et références reçus. Une recherche vide dans un échantillon ne prouve pas l’absence dans le dépôt entier.

Pour modifier le logiciel, réutiliser Teacher → Mentor → tests → paquet → commit → PR, avec provenance réelle et contrôles existants. La conversation ne gagne pas un deuxième moteur de déploiement. Une bonne explication ou un paquet prêt ne constitue pas une correction livrée.

### 5 — Intégrations cohérentes et résultats typés

Rattachement : MEL-CHAT-08, avec les critères existants de MEL-FOUNDER-01.

Vérifier le contrat d’entrée, l’autorisation, le dispatch, la sortie structurée et la synthèse sur les intégrations existantes. Normaliser succès, refus, indisponibilité, quota, timeout, attente et résultat partiel. Associer les résultats à leur appel exact pour les tâches dépendantes.

Tester d’abord les lectures déjà autorisées. Les envois, écritures, suppressions et changements de production conservent leurs autorisations actuelles. Ne jamais demander ni afficher un secret dans le chat. Une prise en charge ou mise en file ne devient pas une réussite d’exécution. Pas de nouveau bus, nouvel orchestrateur, connecteur décoratif ni service payant.

### 6 — Recette réelle, audits et amélioration continue

Rattachement : MEL-CHAT-06.

Construire progressivement un corpus représentatif : conversation, ambiguïté, corrections, questions actuelles, recherche, documents, médias, outils multiples, code et pannes. Les cas ci-dessus forment le noyau initial. Étendre à au moins 50 cas avant une déclaration de qualité générale ; ce nombre est une cible de recette, pas un score déjà acquis.

Distinguer trois mesures :

1. Logiciel : routage, contrats, sécurité, idempotence, streaming, stockage et rendu sous tests contrôlés.
2. Réponse du modèle réel : pertinence, exactitude, traitement complet, contexte, clarté et preuves.
3. Disponibilité opérationnelle : service connecté, données récupérées, média décodé, version déployée.

Chaque résultat conserve cas, SHA, modèle, outils, résultat observé, provenance, latence, quota et éventuel statut de blocage. Une erreur d’authentification correctement expliquée peut réussir le critère de véracité ; elle ne compte pas comme lecture ou livraison réussie. Les échecs et les cas bloqués restent visibles.

Cibles proposées avant clôture : zéro action non autorisée, zéro réalisation fictive, zéro secret exposé ; 100 % des scénarios critiques de sécurité et rendu accepté ; au moins 90 % des cas utiles satisfaits sur le corpus réel, avec les limites publiées. Mesurer les latences avant de fixer une cible ; toute attente garde le budget serveur inférieur à celui du navigateur. Ces cibles ne sont pas des résultats actuels.

Rejouer la CI complète sur le SHA exact, la preview isolée si applicable et la recette de production autorisée. Les audits lisent la roadmap canonique et les preuves ; un statut DONE_VERIFIED exige les critères satisfaits et l’avis réel du Council, jamais un verdict simulé. En cas de régression, conserver le rollback existant et l’échec explicite.

## Sources techniques consultées et adaptation retenue

- [OpenAI : orchestration des function calls](https://github.com/openai/openai-cookbook/blob/main/examples/reasoning_function_calls.ipynb) — résultats réinjectés et séquences dépendantes ; réutilisation de la boucle MEL.
- [Codex officiel](https://github.com/openai/codex) — agent de développement outillé ; aucune installation ou souscription effectuée.
- [Hugging Face : tool use](https://github.com/huggingface/transformers/blob/main/docs/source/en/chat_extras.md) — l’application exécute les demandes du modèle puis lui renvoie les résultats.
- [Hugging Face : multimodal](https://github.com/huggingface/transformers/blob/main/docs/source/en/chat_templating_multimodal.md) — données typées et échantillonnage vidéo réel.
- [Anthropic : RAG et évaluation séparée](https://github.com/anthropics/anthropic-cookbook/blob/main/capabilities/retrieval_augmented_generation/guide.ipynb) — mesurer récupération et réponse séparément. Les API Anthropic/Voyage payantes de cet exemple ne sont pas installées ni utilisées.
- [Anthropic : Building Evals](https://github.com/anthropics/anthropic-cookbook/blob/main/misc/building_evals.ipynb) — corpus spécifiques à la tâche et critères de notation explicites.
- [MCP : contrats et résultats des outils](https://github.com/modelcontextprotocol/specification/blob/main/docs/specification/2025-06-18/server/tools.mdx) — schémas, sorties structurées et erreurs ; adaptation au bus unique existant, sans nouveau protocole imposé.
- [SWE-bench](https://github.com/SWE-bench/SWE-bench) — évaluer sur de vrais problèmes et correctifs vérifiés ; aucun benchmark ni score SWE-bench attribué à MEL.

Principes retenus : outils simples avec contrats réels, contexte pertinent, résultats vérifiables, rendu testé, évaluations reproductibles et limites explicites. Aucun entraînement de poids ni égalité avec un modèle propriétaire n’est promis par cette feuille de route.
