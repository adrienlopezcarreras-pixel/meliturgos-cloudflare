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
