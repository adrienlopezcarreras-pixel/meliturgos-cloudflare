# MEL 24h Sprint Status

Target: 2026-09-12 — Tomorrow Ready

## Priority order

1. Interface fonctionnelle figée + lisibilité
2. Reliable voice (MediaRecorder canonique)
3. Recall last conversation
4. Answer-first behavior
5. Memory continuity
6. Self-code read/search + Teacher loop
7. Persistent work resume
8. Two autonomous candidate proofs
9. Illustrated background/avatar pass after functional core (assets already designed; new image pass later)

## Status — 2026-09-11 après release interface

- Interface fonctionnelle: DEPLOYED — CI verte; vérification utilisateur réelle en cours
- Illustrated backgrounds / avatar polish: DEFERRED_TO_IMAGE_PASS — ne bloque plus l'autonomie
- Voice: DEPLOYED_AWAITING_USER_PROOF — MediaRecorder finalizer, conflit legacy neutralisé, tests verts
- Conversation recall: DEPLOYED_AWAITING_USER_PROOF — route conversations + messages reliée à l'UI, tests verts
- Answer-first: CANDIDATE_TRAINING — persona modifiée et testée sur `candidate/augmentio-core`
- Memory continuity: PARTIAL — prochaine mission réelle de MEL
- Self-code: PARTIAL — branche candidate réalignée sur la base validée
- Teacher loop: PARTIAL — leçons persistées, CI candidate active
- Work resume: PARTIAL — priorité autonomie actuelle
- Autonomy proofs: STARTING — deux petites missions réelles à exécuter sur candidate

## Première mission MEL — MEMORY/CONVERSATION

But : prouver qu'un échange texte, audio et fichier reste rappelable sans polluer le texte utilisateur.

1. Inspecter `src/api/native-chat.js`, `src/conversations/`, `src/conversations/intercept.js` et `src/pages/mvp-behavior-enhancer.js`.
2. Séparer `text`, `attachments` et `file_context` au lieu de concaténer le contenu fichier dans `body.text`.
3. Conserver une provenance explicite : `chat`, `voice`, `file`, `chat+file`.
4. L'archive doit stocker le texte réellement saisi/transcrit, plus les métadonnées des pièces jointes, sans transformer le contenu du fichier en instruction utilisateur persistante.
5. Ajouter les tests avant toute proposition de promotion.
6. Ne modifier que la candidate. Aucune production autonome.

## Deuxième mission MEL — SELF-CODE/TEACHER

But : démontrer une boucle de développement supervisée complète.

1. Lire/rechercher son propre dépôt.
2. Produire le diagnostic d'un écart précis de roadmap.
3. Faire le préflight Council obligatoire.
4. Préparer le correctif minimal sur candidate.
5. Lancer tests/CI et produire les preuves.
6. Soumettre le résultat à Teacher; corriger si nécessaire.

## Freeze until Tomorrow Ready

APK, native Linux/Windows packaging, talking avatar/video, MCP, new OAuth connectors, LoRA/fine-tuning, marketplace, Wake-on-LAN.
