# Preuves et limites de l’analyse vidéo

Le moteur existant `media.video.analyze` extrait un échantillon vidéo dans Browser Run puis appelle les modèles de vision et, si du son a été capturé, de transcription. Une analyse de storyboard n’est pas une preuve de visionnage intégral. La [documentation multimodale Hugging Face](https://github.com/huggingface/transformers/blob/main/docs/source/en/chat_templating_multimodal.md), consultée le 24 octobre 2026, décrit notamment la fourniture des données réelles et l’échantillonnage vidéo par images ou FPS. Aucun modèle, provider ou coût nouveau n’est ajouté ici.

## Contrat conservé et précisé

- Vision et transcription réussies : `ok:true`, `status:SUCCEEDED`, `partial:false`, transcription réelle.
- Vision réussie, transcription échouée, vide, trop volumineuse ou non capturée : `ok:true` pour le résultat visuel disponible, `status:PARTIAL`, `partial:true`, `transcript:null` et `transcript_status` explicite. Cela ne certifie pas une analyse sonore réussie.
- Aucune capture audio : le résumé décrit uniquement cette capture absente dans l’échantillon ; il ne déclare pas la vidéo muette.
- Une erreur de transcription est résumée par son code sûr, jamais par le corps brut ou le message privé du fournisseur. Sans code sûr : `AUDIO_ANALYSIS_UNAVAILABLE`.
- Vision échouée : rejet inchangé ; aucun résultat partiel fictif n’est créé.

Le résumé humain distingue ces états et indique sa portée visuelle. Les limites de taille, preuves de gratuité, providers existants, autorisations et stockage ne sont pas modifiés.

## Validation

`tests/browser-run-video-capabilities.test.mjs` exécute les vrais adapters avec transports de test identifiés : réussite complète, transcription en timeout, réponse vide, absence de capture, audio dépassant la limite, erreur privée sans code et échec de vision. Les autres tests média vérifient les preuves zéro coût inchangées. Ces simulations ne prouvent pas une exécution des fournisseurs en production.

Cette correction porte sur le résultat de l’analyseur existant. Elle ne démontre pas que le chat sait déjà analyser toutes les vidéos jointes ; ce parcours doit être vérifié séparément avec les octets ou images réellement transmis et les autorisations applicables.
