# MEL — Coordination de la grande mise à jour

Date de reprise : 2026-09-09
Branche candidate : `candidate/grande-maj-chat-queue-2026-09-09`

## Objectif global
Faire évoluer MEL vers un assistant personnel généraliste avancé : conversation, mémoire persistante, voix, fichiers, outils, modules, autonomie contrôlée et mode professeur, tout en gardant une interface simple et utilisable sur mobile et PC.

## Priorité immédiate — conversation fluide
Le compositeur doit se comporter comme un vrai chat moderne :

1. zone de texte réellement multiligne ;
2. `Entrée` envoie ;
3. `Maj+Entrée` ajoute une nouvelle ligne ;
4. la zone de saisie reste active pendant la génération ;
5. envoyer un nouveau message pendant la génération ne doit pas interrompre la réponse en cours ;
6. les nouveaux messages sont placés dans une file FIFO et traités ensuite dans l’ordre ;
7. seul le bouton explicite `Stop` doit annuler la génération active ;
8. un arrêt ne doit pas effacer automatiquement les messages déjà en attente ;
9. l’état de file doit être observable : `idle`, `generating`, nombre de messages en attente ;
10. aucun doublon d’envoi en cas de double clic, répétition clavier ou relance réseau.

## Architecture candidate
Le fichier `candidate/chat-message-queue.mjs` contient une file d’envoi indépendante de l’UI et du fournisseur de modèle. Elle doit être intégrée autour du chemin réel d’appel `/api/chat` quand le code runtime sera disponible dans le dépôt ou accessible dans Cloudflare.

## Tests d’acceptation conversation
- Un message seul est traité immédiatement.
- Trois messages envoyés rapidement sont traités dans l’ordre A → B → C.
- B et C peuvent être saisis et envoyés pendant que A est en génération.
- `Shift+Enter` n’envoie rien et insère une nouvelle ligne.
- `Enter` envoie si le compositeur n’est pas vide.
- `Stop` interrompt uniquement le message actif.
- Après `Stop`, le prochain message en file peut être repris normalement.
- Une erreur réseau sur un message ne détruit pas toute la file.
- Aucun message ne doit être traité deux fois.

## Priorités de la grande mise à jour
### P0 — cœur réel
- `/api/chat` relié aux capacités réelles de MEL ;
- health dynamique des capacités ;
- vrais `code.search` / `code.read` ;
- tool loop avec réinjection des résultats ;
- provenance ;
- archivage sans doublon ;
- Teacher Bridge `ONLINE|OFFLINE|DEGRADED` sans bloquer MEL.

### P1 — interface de conversation
- file de messages non bloquante ;
- textarea multiligne ;
- `Enter` / `Shift+Enter` ;
- bouton Stop séparé ;
- suppression de `Interaction count` ;
- suppression des doublons de boutons et éléments ;
- lisibilité et responsive mobile/PC.

### P2 — voix et mémoire
- clic sur le visage de MEL = micro ;
- réveil vocal `Bonjour MEL` / `Allô MEL` ;
- transcription des conversations audio vers la mémoire ;
- réponse vocale ;
- mémoire persistante avec provenance et déduplication.

### P3 — fichiers et multimodalité
- zone texte/drop unique ;
- réception de fichiers sans bloquer le chat ;
- images, audio, vidéo et documents ;
- traitement asynchrone côté workflow sans figer l’interface.

### P4 — autonomie et modules
- registre de capacités ;
- modules installables/activables ;
- healthcheck par module ;
- capacité à proposer puis préparer des modifications de son propre code en branche candidate ;
- tests + diff + review avant toute mise en production ;
- aucune exposition de secrets.

## État d’accès au 2026-09-09
- dépôt GitHub `adrienlopezcarreras-pixel/meliturgos-cloudflare` accessible ;
- dépôt principal contient actuellement surtout le Teacher Bridge et sa documentation ;
- le code runtime complet de l’interface et de `/api/chat` n’est pas présent sur `main` ;
- tentative d’accès interactif à Cloudflare bloquée car le portefeuille TinyFish est insuffisant ;
- aucune prétention de déploiement production tant que le runtime réel n’a pas été récupéré et testé.

## Règle de travail
Développement en branche candidate → tests → diff → review → seulement ensuite déploiement. Ne jamais stocker de clé, token, mot de passe ou secret dans GitHub.
