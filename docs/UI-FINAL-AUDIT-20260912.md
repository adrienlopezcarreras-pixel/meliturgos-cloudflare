# MEL — audit final des interfaces (2026-09-12)

## Périmètre

Audit du mode complet (`/professor`) et du mode normal (`/`) après retour utilisateur sur l'interface réellement déployée. Objectif : une commande = une fonction identifiable, aucun doublon de surface, aucun bouton statique sans gestionnaire, et aucun déploiement automatique depuis cette branche de nettoyage.

## Mode complet — structure retenue

Le mode complet est désormais autonome et n'empile plus `control-room.js` avec une seconde couche de salon. Les cinq vues visibles ont chacune un rôle unique :

- **Vue d'ensemble** : état vérifié, branche/code, Mentor, orchestration et compteurs. Seule action : `Actualiser`.
- **Salon IA** : un seul historique, un seul champ, un seul bouton `Envoyer`. Le sélecteur choisit entre **MEL**, **Mentor MEL** et **Conseil Multi-IA**.
- **Travail** : créer un travail, actualiser la liste, lire le détail ou exécuter une étape. `Détail` est lecture seule ; `Exécuter une étape` est une action distincte.
- **Roadmap** : lecture seule. Aucun bouton « prochaine tâche » ni changement d'état manuel ambigu.
- **Diagnostic** : un seul bouton `Lancer l'audit`; `Audit profond` est une option explicite et non une seconde commande.

### Commandes supprimées comme redondantes

- `Statut MEL` : doublonnait la vue d'ensemble et l'actualisation globale.
- `Mentor gratuit` : doublonnait le choix Mentor du salon.
- `Prochaine tâche` : doublonnait Roadmap/Travail.
- `Dernière réponse`, `Fin du chat`, `Grande lecture` : contrôles de navigation non indispensables, dont deux recouvraient le défilement natif.
- Ancien compositeur `Conseil Multi-IA` séparé : fusionné dans le salon unique.
- Ancien salon `Adrien · MEL · Mentor` injecté au-dessus du Control Room : supprimé.

### Boutons statiques contrôlés

- `refreshAll` → `loadOverview`
- `chatSend` → `sendChat`
- `workCreate` → `createWork`
- `workRefresh` → `loadWork`
- `runAudit` → `runAudit`
- Navigation latérale → gestionnaire commun `data-view`
- Boutons dynamiques de travail → délégation `data-job-action` (`detail` / `run`)

Chaque action affiche un état occupé, un résultat ou une erreur visible ; les appels d'état principaux utilisent `Promise.allSettled` afin qu'un service indisponible ne rende pas toute l'interface muette.

### Avatar / icône

Le mode complet utilise désormais `/meliturgos-avatar-fille.png`, déjà éprouvé sur la barre latérale de l'interface visible par l'utilisateur, au lieu de l'avatar qui apparaissait vide dans le salon injecté.

## Mode normal — structure retenue

Le mode normal reste volontairement simple :

- menu de thèmes ;
- visage de MEL cliquable pour la voix ;
- historique de conversation ;
- un champ texte ;
- dépôt de fichiers ;
- `Envoyer` ;
- `Lectures du jour` ;
- `Mode complet`.

Les anciens panneaux/commandes de compétences cachés sont retirés. L'état vocal reste une zone `aria-live` discrète : vide au repos, disponible pour les retours d'enregistrement/transcription. L'avatar suit le thème et conserve `/meliturgos-avatar-fille.png` comme repli de sécurité. Les contrôles reçoivent des libellés accessibles et la mise en page reste responsive.

## Garde-fous conservés

- Mentor : route dédiée `/api/gen2/mentor/chat`, statut sans inférence `/api/gen2/mentor/status`.
- Mentor externe : fail-closed tant que la gratuité du compte n'est pas explicitement confirmée côté serveur.
- Conseil Multi-IA : reste soumis au Zero-Euro Governor.
- Aucun bouton de cette interface ne contourne les validations des capacités sensibles.
- Aucun déploiement production déclenché par cette branche de nettoyage.

## Validation automatisée

La CI de la branche `cleanup/ui-finalization-20260912` vérifie notamment :

- syntaxe ;
- sécurité des dépendances ;
- suite de tests complète ;
- un seul salon/compositeur en mode complet ;
- absence des anciens IDs/boutons redondants ;
- présence d'un gestionnaire pour chaque action statique ;
- séparation Mentor / Conseil ;
- présence de la roadmap, Work et diagnostic ;
- mode normal simplifié et avatar résilient.

La promotion vers la branche candidate puis le redéploiement restent volontairement en attente de validation utilisateur.
