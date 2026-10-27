# Companion : présence pendant une commande longue

Statut : correction en validation, aucun déploiement ni installation PC effectué.

Preuves fournies par le propriétaire : codeur qwen2.5-coder:7b répondant directement en 17,2 secondes ; deux commandes du PC actuel confirmées SUCCEEDED en 78 et 93 secondes ; interface déclarant ensuite le moteur arrêté ou son état expiré. Ces observations ne prouvent pas une panne d’Ollama.

La même boucle PowerShell publiait la vue locale et les heartbeats, puis attendait system.exec jusqu’à 600 secondes avec WaitForExit. Cette attente dépassait les seuils d’expiration de l’interface (45 secondes pour la vue locale et 35 secondes pour la confirmation de connexion).

Correction canonique : un seul helper de supervision est utilisé au repos et pendant l’attente bornée du processus enfant. Il conserve les heartbeats authentifiés existants, publie les états réels, et traite les demandes locales du propriétaire. Il ne récupère aucune seconde commande Cloud pendant celle en cours. Les pipes stdout/stderr restent drainés simultanément et le timeout reste un échec avec arrêt du processus enfant. Le moteur passe à 1.5.3 ; assets/dist et version attendue côté API restent cohérents.

Le contrôle de permission locale et le traitement durable des résultats ne changent pas. Un moteur vivant ne devient pas artificiellement un exécuteur Node actif : le test garde explicitement l’état d’exécuteur arrêté. Les compteurs de connexion ne sont pas forcés en production.

Validation : 25 tests Node ciblés réussis. Test Windows ajouté : enfant PowerShell réel de 48 secondes (> seuil de vue), sorties importantes sur les deux pipes, heartbeats simulés durant le traitement, requête Stop locale traitée avant sa fin, puis timeout d’un autre enfant. Le transport heartbeat est une fixture : aucune connexion de production ni inférence IA n’est simulée comme preuve réelle. La CI Windows et la suite complète restent à constater avant fusion.

Limites : les attentes synchrones d’installation d’outils ou de modèles ne sont pas modifiées par ce lot ; il cible system.exec, chemin utilisé par les appels au codeur local. Aucun Council, quorum, plafond de neurones, D1 ou préférence MAX modifié. Aucun appel IA Cloud ni essai IA réel en production lancé. MAX a été observé via son API publique en pause ; la reprise appartient au propriétaire.

XP MEL : NON — séparation entre travail long, signal de présence et preuve de résultat déjà couverte par les règles existantes.
