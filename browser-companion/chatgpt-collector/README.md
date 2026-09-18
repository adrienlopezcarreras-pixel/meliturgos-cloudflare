# MEL ChatGPT Collector (Firefox)

Collecteur local et progressif des conversations ChatGPT vers la mémoire persistante de MEL.

## Fonctionnement

- découvre les conversations via la barre latérale ChatGPT et l'historique Firefox ;
- ouvre les conversations une à une ;
- extrait les messages affichés dans le DOM ;
- envoie chaque conversation vers `/api/gen2/import/chatgpt-archive` ;
- s'appuie sur la déduplication MEL par identifiant de conversation + identifiant de message ;
- garde localement la file, les réussites, les échecs et les compteurs ;
- reprend après interruption ;
- capture également les nouvelles conversations stables pendant l'utilisation normale de ChatGPT.

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

Le collecteur ne peut récupérer que les conversations que Firefox peut ouvrir. L'historique du navigateur augmente fortement la couverture par rapport à la seule barre latérale, mais l'export officiel ChatGPT restera utile pour contrôler l'exhaustivité et récupérer ce qui n'a jamais été ouvert sur ce navigateur ou certaines pièces jointes.

Le DOM ChatGPT peut évoluer. Le collecteur échoue sans valider la conversation lorsqu'il ne trouve aucun message.
