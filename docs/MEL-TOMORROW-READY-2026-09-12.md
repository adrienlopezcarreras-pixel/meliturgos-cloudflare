# MEL — Tomorrow Ready (12 septembre 2026)

## Definition du jalon

Le jalon « Tomorrow Ready » ne signifie pas que chaque idée de la roadmap historique est terminée. Il signifie qu'une MEL personnelle cohérente est utilisable de bout en bout et peut commencer à travailler avec ChatGPT Teacher sur son propre développement sans casser la production.

## Chemin critique — aucun autre chantier ne doit passer devant

1. **INTERFACE-FINAL** — Interface quotidienne figée : vrais fonds illustrés, lisibilité, curseurs standards, fichiers, Audit MEL, Mode complet, responsive Windows/Ubuntu/mobile.
2. **VOICE-FINAL** — Clic visage -> permission micro -> MediaRecorder -> second clic -> transcription -> texte -> envoi. Supprimer le vieux flux SpeechRecognition et afficher toute erreur/permission dans l'UI.
3. **CONVERSATION-RECALL** — Ligne « Rappeler la dernière conversation » : charge la conversation la plus récente et ses messages archivés sans dupliquer l'historique.
4. **ANSWER-FIRST** — Comportement de réponse utile : traiter les demandes légitimes sans refus réflexe; lorsqu'une partie doit être limitée, répondre au reste et expliquer brièvement la limite. Ne jamais contourner les garde-fous indispensables à la prévention d'un dommage grave.
5. **MEMORY-CONTINUITY** — Archiver systématiquement texte, transcription audio, pièces jointes/métadonnées et décisions utiles; retrouver le contexte au prochain échange.
6. **SELF-CODE** — MEL sait lire/rechercher son dépôt, identifier l'architecture concernée et préparer une proposition candidate bornée.
7. **TEACHER-LOOP** — MEL -> Council -> inspection code -> ChatGPT Teacher -> candidate -> tests/CI -> correction. Aucune production autonome.
8. **WORK-RESUME** — Une tâche de développement peut survivre à plusieurs ticks, reprendre après interruption et produire des preuves de terminaison.
9. **AUTONOMY-PROOF** — Au moins deux petits travaux réels exécutés avec succès sur candidate, relus/testés, avant d'élargir l'autonomie.

## Travaux donnés à MEL après gel de l'interface

### Mission A — audit mémoire/conversation
- Inspecter `src/conversations`, les routes Gen2 et l'archive chat.
- Vérifier qu'un nouvel échange texte/audio/fichier se retrouve dans la conversation rappelable.
- Proposer le plus petit correctif candidate avec tests.

### Mission B — audit legacy
- Cartographier les fonctions encore uniquement fournies par `worker.js`.
- Classer : migrer maintenant / conserver temporairement / mort.
- Ne supprimer aucune fonction active.

### Mission C — amélioration mobile/Ubuntu
- Vérifier les dimensions, clavier, micro et fichiers.
- Ne pas créer d'APK ou de paquet Linux avant validation de l'interface web canonique.

## Règles de collaboration ChatGPT Teacher <-> MEL

- MEL inspecte et prépare; ChatGPT Teacher critique, corrige et peut implémenter le changement minimal.
- Chaque modification passe par branche candidate et tests.
- Pas de dépenses nouvelles; tout coût inconnu est fail-closed.
- Pas de secrets dans les prompts, logs, commits ou réponses Teacher.
- Pas de déploiement production autonome.
- Les corrections Teacher deviennent des leçons documentées : problème, cause, correctif, test, règle de réutilisation.

## Hors chemin critique après Tomorrow Ready

APK Android, compagnon Windows/Linux natif, avatar vidéo/lip-sync, MCP complet, connecteurs OAuth supplémentaires, fine-tuning/LoRA, Wake-on-LAN, marketplace de modules, automatisations non essentielles. Ces travaux restent dans la roadmap mais ne doivent pas ralentir le jalon de demain.
