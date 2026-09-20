# MEL ChatGPT Collector (Firefox)

Collecteur local et progressif des conversations ChatGPT vers la mémoire persistante de MEL.

## Fonctionnement

- découvre les conversations via l'historique Firefox et effectue une exploration profonde bornée de la barre latérale ChatGPT afin de rattraper des conversations jamais ouvertes sur ce PC ;
- ouvre les conversations une à une ;
- extrait les messages affichés dans le DOM ;
- envoie chaque conversation vers `/api/gen2/import/chatgpt-archive` ;
- s'appuie sur la déduplication MEL par identifiant de conversation + identifiant de message ;
- garde localement la file, les réussites, les échecs et les compteurs ;
- impose une sonde DOM courte (15 s) et une stabilisation strictement bornée à 3 minutes ; si une grosse conversation se bloque, l'onglet de collecte est automatiquement vidé puis la conversation est remise une fois en file, sans nécessiter `Pause` / `Démarrer` ;
- les appels au contenu et l'import réseau ont leurs propres délais maximum afin qu'une promesse bloquée ne puisse plus immobiliser toute la collecte ; après deux tentatives d'un blocage transitoire, l'élément est différé et la file passe automatiquement au suivant ;
- reprend après interruption et permet de remettre explicitement les conversations différées en file ;
- capture également les nouvelles conversations stables pendant l'utilisation normale de ChatGPT, mais seulement par petits incréments et jamais pendant le traitement massif ;
- une capture passive partielle reste marquée `partial` et ne peut jamais empêcher le passage massif de récupérer la conversation complète ;
- en mode PC très lent, découpe l'extraction DOM en petits lots avec des pauses afin de rendre la main à Firefox ;
- attend que le DOM d'une conversation soit stable avant l'extraction ;
- évite le balayage coûteux de tous les `div` de ChatGPT pendant la découverte normale ;
- après une grosse conversation (ou périodiquement), vide l'onglet de collecte sur `about:blank` pour aider Firefox à libérer la mémoire ;
- allonge automatiquement la pause après les conversations de 250+ et 600+ messages.

Aucun mot de passe ChatGPT n'est lu ou stocké.

## Installation temporaire dans Firefox

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer **Charger un module complémentaire temporaire**.
3. Sélectionner le fichier `manifest.json` de ce dossier.
4. Ouvrir les réglages de l'extension et renseigner l'URL + les identifiants MEL.
5. Laisser un onglet `https://chatgpt.com/` ouvert et connecté.
6. Cliquer **Démarrer / reprendre**.

Le mode temporaire disparaît après redémarrage de Firefox. Pour une installation permanente sur Firefox stable, il faudra ensuite empaqueter et signer l'extension.

## Limites

Le collecteur ne peut récupérer que les conversations que Firefox peut ouvrir ou découvrir dans l'interface ChatGPT. L'historique du navigateur et l'exploration profonde de la barre latérale augmentent fortement la couverture, mais l'export officiel ChatGPT reste la seule référence externe permettant de contrôler une exhaustivité absolue du compte et de récupérer certaines pièces jointes.

Le DOM ChatGPT peut évoluer. Le collecteur échoue sans valider la conversation lorsqu'il ne trouve aucun message. Les conversations différées et les échecs non résolus ne sont plus redécouverts automatiquement pendant le passage courant : ils restent isolés jusqu'à l'action « Réessayer échecs / différées », ce qui évite une boucle infinie tout en permettant une reprise volontaire.
