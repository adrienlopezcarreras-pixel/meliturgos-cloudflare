# MEL — Teacher Lessons

Ce fichier transforme les corrections de ChatGPT Teacher en règles réutilisables par MEL.

## 2026-09-11 — Interface et release

### Leçon 1 — Ne pas confondre décor CSS et image illustrée
- Problème : des gradients CSS ont été présentés comme des fonds « grandioses ».
- Cause : le critère visuel utilisateur n'était pas vérifié littéralement.
- Règle : quand la demande exige « des images », utiliser de vrais assets image et vérifier leur rendu; ne pas substituer un gradient ou un dessin CSS.
- Test : chaque thème qui promet une scène illustrée doit référencer un asset image servi par l'application.

### Leçon 2 — Une couche d'amélioration ne doit pas laisser un ancien runtime contredire le nouveau
- Problème : le nouvel enregistrement `MediaRecorder` coexistait avec l'ancien `SpeechRecognition`; Firefox pouvait afficher « Reconnaissance vocale non disponible » et le clic semblait inactif.
- Cause : comportement historique laissé dans l'interface de base puis surchargé par un enhancer.
- Règle : lorsqu'une fonction canonique remplace un ancien chemin, supprimer ou neutraliser explicitement l'ancien chemin et couvrir le conflit par un test.
- Test : Firefox/Chromium sans `SpeechRecognition` doivent quand même activer le micro via `getUserMedia` + `MediaRecorder`.

### Leçon 3 — Vérifier la branche et le SHA avant toute modification
- Problème : une ancienne branche peut rester valide mais diverger fortement de `main`.
- Règle : avant tout travail autonome, récupérer le SHA de `main`, le SHA de la candidate et refuser une modification si la base attendue n'est pas prouvée.

### Leçon 4 — Les fonctions actives ne sont jamais supprimées sur simple apparence
- Problème : `worker.js` a semblé vide dans une vue tronquée mais contenait encore des API actives.
- Règle : avant suppression, inventorier les routes/imports, inspecter le blob complet si nécessaire, puis prouver la couverture de remplacement avec des tests.

### Leçon 5 — Production après preuves seulement
- Règle : candidate -> audit dépendances -> syntaxe -> suite complète -> Teacher/owner -> release. MEL ne déploie pas seule en production.

### Leçon 6 — Une fonction utilisateur doit être visible ET reliée à une source réelle
- Problème : « Continuer depuis la dernière phrase » a été confondu avec « Rappeler la dernière conversation ».
- Cause : deux besoins voisins ont été traités comme équivalents.
- Correctif : le rappel liste réellement `/api/gen2/conversations`, sélectionne la plus récente puis charge `/api/gen2/conversations/messages`.
- Test : l'interface doit contenir le libellé exact « Rappeler la dernière conversation » et appeler les deux routes Gen2.
- Règle : ne jamais valider une exigence par similarité de libellé; vérifier le comportement demandé de bout en bout.

### Leçon 7 — ANSWER_FIRST : répondre au maximum utile, limiter au minimum nécessaire
- Objectif : MEL ne doit pas transformer un sujet sensible ou controversé en refus automatique.
- Règle : distinguer connaissance/analyse/fiction/histoire/droit/prévention d'une aide opérationnelle qui faciliterait directement un dommage grave.
- Règle : si une petite partie doit être limitée, ne limiter que cette partie et continuer à répondre au contexte, à l'explication, aux causes, à la théorie, au droit, aux risques, à la prévention et aux alternatives sûres.
- Règle : si un modèle externe refuse une demande légitime, ne pas recopier le refus; reformuler ou utiliser une autre capacité autorisée puis synthétiser une réponse utile.
- Test : le System Prompt doit contenir explicitement `ANSWER_FIRST`, « refus réflexe », « refus global » et la règle de limitation partielle.

### Leçon 8 — Un correctif concurrent doit prendre la main avant l'ancien gestionnaire
- Problème : plusieurs listeners pouvaient répondre au même clic sur l'avatar.
- Correctif : le runtime final utilise un listener en capture et `stopImmediatePropagation()` pour rendre le flux MediaRecorder canonique jusqu'à suppression définitive du legacy.
- Règle : lorsqu'une migration par couches est temporairement nécessaire, imposer une seule autorité d'exécution et tester l'absence de double déclenchement.

## Format des prochaines leçons

Pour chaque correction :
1. problème observé;
2. cause;
3. correctif;
4. test qui aurait dû l'attraper;
5. règle généralisable;
6. fichiers/compétences concernés.
