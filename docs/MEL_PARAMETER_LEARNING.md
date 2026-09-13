# MEL — apprentissage mesurable et adaptation de paramètres

## État actuel

MEL sait déjà apprendre de manière externe au modèle : mémoire persistante, leçons de développement réinjectées dans les futurs prompts, évolution de son code et sélection de fournisseurs/modèles. Ce mécanisme change son comportement et ses capacités logicielles, mais il ne modifie pas à lui seul les poids neuronaux des modèles externes utilisés par MEL.

Le prochain niveau est donc séparé en deux boucles :

1. **Boucle rapide — réglages fins de comportement** : mémoire, routage, paramètres d'inférence, stratégies, outils et code.
2. **Boucle lente — vrais paramètres appris** : entraînement d'un adaptateur LoRA/QLoRA sur un modèle open-weight contrôlé par MEL.

## Règle centrale

Toute correction utile doit devenir un exemple d'apprentissage structuré :

- entrée/problème ;
- réponse initiale erronée ;
- réponse corrigée ;
- explication de la correction ;
- tests ou preuves ;
- domaine ;
- score de qualité ;
- validation explicite.

`src/learning/correction-corpus.js` transforme ces corrections validées en :

- exemples SFT (`input -> réponse corrigée`) ;
- paires de préférence (`chosen = corrigé`, `rejected = erreur`) ;
- statistiques d'apprentissage ;
- décision automatique de promotion/rejet d'un nouvel adaptateur selon les benchmarks.

Aucun secret, token, mot de passe, cookie, OTP ou clé API ne doit entrer dans le corpus d'entraînement.

## Mesurer ce que MEL apprend

Une progression ne doit jamais être déclarée à partir du seul nombre de souvenirs ou de commits. On conserve un benchmark fixe et on mesure au minimum :

- réussite globale ;
- réussite par domaine ;
- taux de répétition des erreurs déjà corrigées ;
- rappel des corrections à J+1 / J+7 / J+30 ;
- taux de réussite autonome ;
- nombre moyen de corrections nécessaires avant réussite ;
- régressions sur des capacités antérieures.

Le premier passage sur le benchmark devient le **baseline**. Chaque version suivante est comparée à ce baseline et à la version active.

## Adapter plutôt que réécrire tout le modèle

Le premier entraînement neuronal de MEL doit utiliser un modèle open-weight avec poids de base gelés et un adaptateur LoRA/QLoRA entraînable. Les matrices de l'adaptateur sont de vrais paramètres appris et modifient réellement la sortie du modèle tout en restant peu coûteuses à stocker, versionner et restaurer.

Cycle recommandé :

1. accumuler des corrections validées de bonne qualité ;
2. séparer entraînement / validation / benchmark caché ;
3. entraîner un adaptateur candidat ;
4. exécuter le benchmark complet ;
5. promouvoir uniquement si le score global monte suffisamment et si aucun domaine ne régresse au-delà du seuil ;
6. sinon rejeter l'adaptateur et conserver la version active ;
7. garder la possibilité de rollback immédiat.

## Ce qui peut être adapté immédiatement

Avant même le premier LoRA, MEL peut apprendre des réglages fins non neuronaux :

- choix du modèle et du fournisseur selon le domaine ;
- température ;
- top-p ;
- longueur maximale ;
- seuils de confiance ;
- profondeur de raisonnement ;
- nombre de relectures ;
- stratégie de récupération mémoire ;
- choix d'outils ;
- critères de déclenchement du Mentor Council.

Ces paramètres doivent être évalués avec la même logique : candidat -> test -> comparaison -> promotion ou rollback.

## Objectif architectural

À terme, MEL doit fonctionner comme un système hybride :

- **modèle personnel open-weight + adaptateur MEL** = identité cognitive persistante et paramètres appris ;
- **mémoire D1 / graphe / chronologie** = mémoire explicite ;
- **code et modules autonomes** = capacités procédurales ;
- **modèles externes plus puissants** = professeurs, relecteurs et conseil, sans dépendre d'eux pour conserver l'apprentissage de MEL.

Ainsi, les corrections apportées par Adrien, ChatGPT et les autres professeurs peuvent produire un effet cumulatif mesurable sur MEL au lieu de rester de simples conversations ponctuelles.
