# [Codex] Contrôle local du Dev Executor

Ouvrir MEL Companion Windows, ou « Companion MEL » depuis l’icône de notification
du moteur historique. Les deux interfaces pilotent le même superviseur. La section
« Exécuteur de développement » affiche le dépôt, l’état du processus et le
dernier heartbeat confirmé par MEL. Démarrer, Arrêter et Redémarrer agissent
sur l’exécuteur existant ; aucune commande PowerShell n’est nécessaire.

Au premier démarrage, choisir le dépôt principal contenant `.git` et
`scripts/mel-dev-bridge.mjs`. Les répertoires `.mel-dev-candidates` sont refusés.
Node.js et les identifiants du pont déjà configurés restent nécessaires.
Le Companion ne copie ni n’affiche les secrets.

« Démarrer » autorise la reprise au prochain lancement du Companion en
persistant `dev_executor_enabled=true` et `dev_executor_repo` dans
`computer.json`. « Arrêter » persiste la désactivation avant d’arrêter le
processus ; la supervision ne le relance pas. Les autres paramètres sont
conservés et le remplacement du fichier est atomique.

Un crash de Node est signalé ; utiliser « Redémarrer » pour réessayer.
`EXTERNAL_EXECUTOR_ACTIVE` signifie qu’un pont lancé en dehors du Companion
existe : il n’est ni dupliqué ni tué. `PROCESS_ALREADY_SUPERVISED` signifie
qu’une autre instance du Companion possède déjà la supervision.

Le mutex local, la propriété du processus et le port exclusif évitent les
doubles exécutions. Les opérations Git, la validation des paquets et les
autorisations cloud/locales existantes sont conservées. Un arrêt local utilise
un signal sur fichier privé puis une terminaison bornée de l’arbre possédé.
La fenêtre native transmet uniquement Start/Stop/Restart au moteur existant,
avec identifiant, PID cible et expiration ; une demande rejouée est ignorée.
L’exécuteur cesse également de recevoir de nouveaux travaux lorsque son
Companion parent disparaît. Aucun ordre shell n’est ajouté aux commandes cloud.
L’arrêt ou le redémarrage volontaire du moteur natif termine aussi son arbre
de processus possédé ; les autres Node.js ne sont jamais ciblés par leur nom.

La fenêtre reste non modale : l’ouvrir ne suspend ni heartbeat ni supervision.
Son timer ne fait que rafraîchir les libellés. Un processus sans confirmation
cloud récente ne s’affiche pas « En ligne ». L’état du relais GitHub est lu
séparément depuis son heartbeat cloud, sans contenu de tâche ni métadonnées
privées ; une réponse ancienne ou indisponible est affichée « Inconnu ».
MEL MAX conserve son fonctionnement cloud sans PC.

Tests : processus Node réels sur loopback, refus d’un second processus avant
heartbeat/claim, erreur d’authentification sans secret, SQLite réel pour le
relais ; scénario Windows dédié avec boutons WinForms et vrais processus.
Les fixtures ne constituent pas une preuve de communication avec la production
ni une recette sur le PC personnel du propriétaire.

XP MEL : NON — réutilisation des règles existantes de consentement local,
de présence confirmée, d’unicité et de preuve réelle. Aucune fusion ni aucun
déploiement autorisés par cette livraison ; lot en revue jusqu’à intégration.
