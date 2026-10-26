# Chat — modèle compatible et LoRA

Statut : correction locale, validation production non effectuée.

Le bouton bas du chat sélectionne `lora_mode:uncensored` pour la requête. Il ne lance ni entraînement, ni activation, ni MAX. Le serveur ignore tout adaptateur fourni par le navigateur et consulte exclusivement son adaptateur promu par LearningEngine. La paire base/runtime doit appartenir au registre canonique LoRA.

Sans adaptateur compatible : HTTP 409 avant dispatch. En mode requis, un seul runtime compatible est éligible ; voix, continuation et récupération Council conservent ce choix. Échec fournisseur : HTTP 503 explicite, sans repli Qwen ou autre modèle. Les garde-fous de benchmark, autorisation et budget existants ne changent pas.

`active_lora` est maintenant une preuve d’application sur le runtime réellement sélectionné, jamais une simple configuration ; le reçu est conservé dans les métadonnées archivées. Un autre modèle ou une réponse déterministe donne `active_lora:null`.

Le pipeline gratuit cible Mistral-7B-Instruct-v0.2. Ce changement ne prouve ni entraînement terminé, ni checkpoint disponible, ni activation en production, ni qualité linguistique mesurée. Il ne garantit pas le résultat comportemental désigné « uncensored ». Aucun entraînement, mutation D1, service payant ou déploiement lancé.

Tests : tests/chat-lora-binding.test.mjs (compatibilité, modèle préféré incompatible, fanout, panne sans remplacement, absence d’adaptateur, identifiants navigateur ignorés, reçu de fallback, bouton DOM), tests/lora-runtime-pipeline.test.mjs, tests/native-chat-companion-fallback.test.mjs, tests/chat-stream.test.mjs et tests/full-interface-client-runtime.test.mjs.

XP MEL : NON — compatibilité exacte et preuves runtime déjà couvertes par les règles existantes.

## Régression du transport détectée dans Chromium

Après intégration de main 0101ce2c, le transport NDJSON ouvrait HTTP 200 puis convertissait une réponse métier HTTP 409/503 contenant un texte explicatif en événements `delta`/`done`. Correction dans `withChatProgress` : toute réponse HTTP en échec reste un événement `error`, même avec du texte ; elle ne devient jamais un succès du chat. Le statut HTTP externe du flux reste 200 car ses en-têtes sont déjà envoyés ; le statut métier est conservé dans l’événement d’erreur.

Preuve Chromium locale : `/tmp/mel-lora-browser-final-proof/browser-results.json`, 50 contrôles PASS, 0 FAIL, 0 exception JS ; 198 intégrations/actions non exercées restent BLOCKED. Bouton à la souris, retour au clavier, message réel via le point d’entrée de production local : une seule requête, erreur d’adaptateur visible. Ce n’est pas une preuve d’activation LoRA en production.

La suite complète avant synchronisation du dernier main : 934 fichiers PASS, aucun échec. La suite complète du dernier arbre est relancée ; son résultat distant doit être contrôlé avant fusion.
