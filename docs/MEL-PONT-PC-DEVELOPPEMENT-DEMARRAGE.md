# [GPT] Pont de développement MEL — démarrage simple sur Windows

Ce lanceur **manuel** facilite un test de bout en bout du pont existant. Il ne met en place ni service permanent, ni tâche planifiée, ni redémarrage automatique.

## Une seule préparation du PC

1. Installer [Git pour Windows](https://git-scm.com/downloads/win) et [Node.js](https://nodejs.org/) version 22 ou plus récente, depuis leurs sites officiels.
2. Dans l'Explorateur Windows, ouvrir le dossier où conserver le projet. Dans un terminal de ce dossier, saisir :
   `git clone https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare.git`
3. Dans le dossier `meliturgos-cloudflare`, créer un fichier nommé `.dev.vars` avec une variable `MEL_DEV_BRIDGE_TOKEN` correspondant **au secret déjà configuré sur le Worker**. Le conserver exclusivement en local. Ne jamais le transmettre par message, copie d'écran ni commit Git.

## À chaque session autorisée

Ouvrir le dossier `meliturgos-cloudflare/windows-companion` puis double-cliquer sur **Lancer-Pont-Developpement-MEL.cmd**.

Le programme vérifie le dépôt, Node.js et la présence d'une configuration du jeton. Il explique les effets du pont et demande de saisir **OUI** avant de le lancer. Garder la fenêtre ouverte pendant le test ; **Ctrl+C** interrompt le processus.

**Attention :** ce lanceur exécute le pont de développement existant, qui peut récupérer des tâches distantes, modifier le dépôt et lancer des tests. N'autoriser la session que lorsque l'on souhaite effectuer ce travail sur cette machine. Les validations Council et CI restent séparées.

## États et dépannage

- `Depot Git introuvable` : ouvrir la copie clonée du dépôt plutôt qu'un ZIP téléchargé.
- `Node.js n'est pas installe` : installer Node.js 22+ puis rouvrir la fenêtre.
- `Jeton absent` : créer le fichier local `.dev.vars`, sans exposer son contenu.
- `HTTP_401` ou `HTTP_403` : vérifier, dans les réglages secrets du Worker, la correspondance avec le jeton local. Ne pas communiquer le jeton.

La présence de ce script dans GitHub ne prouve pas que MEL a effectué un commit, passé les tests ou terminé une mission : il faut observer un cycle réel sur le PC.
