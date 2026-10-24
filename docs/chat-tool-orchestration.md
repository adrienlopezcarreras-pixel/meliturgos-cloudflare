# Chat MEL : orchestration des outils et preuves

## Sources consultées le 24 octobre 2026

- [OpenAI Cookbook : reasoning function calls](https://github.com/openai/openai-cookbook/blob/main/examples/reasoning_function_calls.ipynb) : appels dépendants exécutés en série, retour du résultat au modèle, ordre de conversation conservé. Les exemples datés ne servent pas de catalogue actuel des modèles.
- [Hugging Face Transformers : tool use](https://github.com/huggingface/transformers/blob/main/docs/source/en/chat_extras.md) : le modèle demande un appel ; l’application doit l’exécuter, conserver l’appel et son résultat, puis produire la réponse. Les formats dépendent du modèle, notamment les balises `tool_call`.
- [Anthropic Cookbook : customer service agent](https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/customer_service_agent.ipynb) : schémas explicites, traitement des outils puis réponse. Cet exemple utilise des données simulées ; ce ne sont pas des preuves de production MEL.

Les pages engineering Anthropic ont été refusées par le proxy ; les sources GitHub ci-dessus ont été effectivement récupérées. Aucun abonnement, appel à une API payante, entraînement ou changement de modèle n’est impliqué.

## Application au chemin existant

`src/api/agent-tools.js` conserve une boucle unique. À chaque étape, le modèle retrouve son appel et ses arguments dans un message assistant, puis une observation JSON indiquant la capacité, les arguments, le statut et le résultat ou l’erreur. Les transports spécifiques aux fournisseurs ne sont pas imposés au protocole textuel Workers AI existant.

Un résultat long devient un aperçu explicitement tronqué, dont le début et la fin sont conservés. L’enveloppe reste un JSON valide ; les données absentes ne sont pas présentées comme lues. Le prompt actif le rappelle au modèle. Les résultats restent des données non fiables.

L’attente du planificateur et des lectures utilise `chat-deadline.js`. Le chat réserve quinze secondes de son budget courant pour rédiger une réponse fondée sur les résultats. Une lecture expirée est FAILED/CHAT_DEADLINE_EXCEEDED et n’est pas relancée ; aucun nouvel appel ne commence après expiration. Le sous-appel peut continuer côté fournisseur : le timeout ne prétend pas l’annuler. Une mutation conserve son résultat réel et ne reçoit pas de timeout artificiel susceptible de provoquer une double exécution.

Les protections existantes restent actives : allowlist, autorisations CapabilityBus, déduplication, quatre étapes maximum, récupération de lectures seulement, distinction exemple documentaire/action et refus d’exécuter des données imbriquées. Les balises de protocole sont retirées des réponses ordinaires.

## Régression

`tests/agent-tools.test.mjs` vérifie les appels dépendants, l’association arguments/résultats, AUTH_REQUIRED conservé, l’aperçu JSON valide, les attentes bloquées, l’absence d’appel après expiration et les balises des modèles ouverts. `tests/chat-global-deadline.test.mjs` vérifie le budget du vrai chat. Les tests média et navigateur continuent de couvrir l’affichage ; leurs fixtures ne prouvent pas un fournisseur réel.

Ces changements améliorent l’orchestration. Ils ne démontrent ni une égalité générale avec Claude/Grok/ChatGPT, ni une capacité inexistante, ni une mission roadmap DONE_VERIFIED. La validation en production reste distincte des tests locaux.


## Compréhension des demandes multimédia : évaluation ciblée

Sources complémentaires consultées le 24 octobre 2026 :

- [Hugging Face : multimodal chat templates](https://github.com/huggingface/transformers/blob/main/docs/source/en/chat_templating_multimodal.md) distingue texte, images et vidéo réellement fournis au processeur. Un nom, titre, lien ou aperçu de fichier ne constitue pas une analyse visuelle ou sonore. Les protections des pièces jointes de MEL restent inchangées.
- [Anthropic Cookbook : Building Evals](https://github.com/anthropics/anthropic-cookbook/blob/main/misc/building_evals.ipynb) recommande des évaluations spécifiques à la tâche et des critères de notation adaptés. L’évaluation ci-dessous est locale et déterministe : aucun juge IA payant ni score de compétence générale.

Le classifieur partagé `inferChatMediaCapability` reconnaît l’objet directement demandé après une commande. Les recherches photo, audio et vidéo n’utilisent plus deux détecteurs indépendants. `inferPublicImageLookup` délègue au même classifieur pour conserver le chemin image existant.

| Demande | Décision attendue |
| --- | --- |
| Montre le code pour afficher une vidéo | Pas de recherche de média |
| Montre les différences entre une photo et une vidéo | Explication, pas de recherche de média |
| Peux-tu me montrer trois photos de chats | Recherche de trois images |
| Montre une vidéo avec trois photos | Recherche d’une vidéo |
| Crée-moi une image pour une vidéo | Génération d’image, pas développement du code |
| Lis à voix haute : mon fichier contient https://example.org | Synthèse du texte littéral, aucune ouverture du lien/fichier |
| Montre cette image / analyse ma vidéo ci-jointe | Reste dans le traitement du contexte privé, aucune recherche publique de substitution |

Les quantités sont bornées à six ; les formulations polies et les nombres en lettres sont reconnus. Les demandes documentaires, explications, négations, références privées et URLs ne déclenchent pas de recherche déterministe. Le texte explicitement cité pour la voix est une donnée à prononcer, jamais une instruction à exécuter.

`tests/chat-media-understanding.test.mjs` vérifie 39 formulations contrastées, trois textes de synthèse vocale et deux passages réels par `/api/chat` avec transport de recherche simulé : demande polie de trois photos et comparaison explicative sans recherche. Les tests de routage mesurent le logiciel ; ils ne prouvent pas la compréhension générale d’un modèle ni l’exécution d’un fournisseur en production.

## JSON demandé et protocole d’action : contrat partagé

Le parseur canonique distingue un enregistrement métier (`{"name":"Adrien","age":30}`), une définition de fonction et un appel explicite avec ses arguments. Les alias `name`, `capability` et `function` nécessitent une enveloppe d’entrée ; les véritables appels restent soumis au dispatcher et aux autorisations existantes. Aucun objet imbriqué dans une donnée tronquée ne devient une action indépendante.

Le filtre du streaming, la réponse finale et l’audit réutilisent cette frontière. Les exemples explicitement demandés restent visibles et ne sont pas exécutés. Le prompt de streaming autorise alors les représentations documentaires tout en interdisant leur exécution et les faux résultats. Les autres réponses continuent de masquer les appels non exécutés, y compris les enveloppes reconnues incomplètes ou fragmentées volumineuses. Une réponse filtrée ne constitue pas une preuve d’exécution.

`tests/chat-json-contract.test.mjs` couvre le parcours réel `/api/chat` avec et sans streaming, des réponses modèle contrôlées, les données métier, les exemples, les appels autorisés, les erreurs de protocole et l’audit. Ces preuves locales ne mesurent pas la qualité générale du fournisseur et ne certifient aucune intégration en production. Ce correctif contribue aux critères compréhension et intégration de la feuille de route professionnelle ; leur validation reste ouverte.
