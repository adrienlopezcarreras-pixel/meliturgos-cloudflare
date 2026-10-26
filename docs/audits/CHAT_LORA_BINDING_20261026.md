# Chat — modèle compatible et LoRA

Statut : correction locale, validation production non effectuée.

Le bouton bas du chat sélectionne `lora_mode:uncensored` pour la requête. Il ne lance ni entraînement, ni activation, ni MAX. Le serveur ignore tout adaptateur fourni par le navigateur et consulte exclusivement son adaptateur promu par LearningEngine. La paire base/runtime doit appartenir au registre canonique LoRA.

Sans adaptateur compatible : HTTP 409 avant dispatch. En mode requis, un seul runtime compatible est éligible ; voix, continuation et récupération Council conservent ce choix. Échec fournisseur : HTTP 503 explicite, sans repli Qwen ou autre modèle. Les garde-fous de benchmark, autorisation et budget existants ne changent pas.

`active_lora` est maintenant une preuve d’application sur le runtime réellement sélectionné, jamais une simple configuration ; le reçu est conservé dans les métadonnées archivées. Un autre modèle ou une réponse déterministe donne `active_lora:null`.

Le pipeline gratuit cible Mistral-7B-Instruct-v0.2. Ce changement ne prouve ni entraînement terminé, ni checkpoint disponible, ni activation en production, ni qualité linguistique mesurée. Il ne garantit pas le résultat comportemental désigné « uncensored ». Aucun entraînement, mutation D1, service payant ou déploiement lancé.

Tests : tests/chat-lora-binding.test.mjs (compatibilité, modèle préféré incompatible, fanout, panne sans remplacement, absence d’adaptateur, identifiants navigateur ignorés, reçu de fallback, bouton DOM), tests/lora-runtime-pipeline.test.mjs, tests/native-chat-companion-fallback.test.mjs, tests/chat-stream.test.mjs et tests/full-interface-client-runtime.test.mjs.

XP MEL : NON — compatibilité exacte et preuves runtime déjà couvertes par les règles existantes.
