# MEL — DEVELOPMENT ROADMAP

> Feuille de route de développement de MEL. Ce document décrit les prochaines générations du système ; le suivi opérationnel détaillé reste dans `MELITURGOS-MASTER-CHECKLIST.md`.

## Principes invariants

- Le patrimoine de MEL est portable : mémoire, datasets, benchmarks, outils, Council IA, règles d'orchestration et historique d'apprentissage ne doivent pas dépendre d'un fournisseur LLM unique.
- Le socle comportemental à faible sur-refus reste une exigence de non-régression lors de tout nouvel entraînement ou changement de modèle.
- Les capacités agentiques sont ajoutées après le socle SFT principal, avec replay du corpus de base afin de limiter l'oubli catastrophique.
- Les limites opérationnelles et autorisations d'action restent gérées par l'orchestrateur / Council IA ; elles ne doivent pas reposer uniquement sur les refus du modèle.
- Aucun adaptateur ni nouveau modèle n'est promu automatiquement : preuve d'entraînement, benchmark, compatibilité et rollback sont obligatoires.

## MEL v1 — Mistral 7B : valider toute la chaîne

**Statut : IN_PROGRESS**

1. Terminer le smoke QLoRA réel sur GPU.
2. Vérifier `adapter_model.safetensors`, `adapter_config.json` et `training-evidence.json`.
3. Mesurer débit, VRAM et durée afin de dimensionner le run complet.
4. Entraîner le corpus principal par checkpoints/reprises si nécessaire.
5. Benchmark Professor : base vs adaptateur.
6. Promotion uniquement après gain mesuré et absence de régression bloquante.

Objectif : utiliser Mistral 7B comme banc de validation reproductible du pipeline MEL, pas comme dépendance permanente de l'identité de MEL.

## MEL v1.5 — couche intelligence pratique / agentique

**Statut : PREPARATION**

Ajouter après le socle principal des données orientées :

- raisonnement pratique et choix entre plusieurs solutions ;
- planification multi-étapes ;
- appels d'outils / function calling ;
- recherche, vérification et correction ;
- gestion d'échec et changement de stratégie ;
- réponses structurées et JSON robuste.

Sources candidates déjà identifiées : Microsoft AgentInstruct, Hermes Function Calling, ToolACE, OpenThoughts Agent SFT, DR-TULU et autres jeux audités.

Règle de mélange initiale à tester : données agentiques majoritaires + replay du corpus de base (ordre de grandeur initial 20–30 % de replay, à ajuster par benchmark).

## MEL v2 — migration vers un cerveau plus capable

**Statut : IN_PROGRESS — étude de compatibilité commencée**

### Candidat principal actuel

`Qwen/Qwen3.8-27B`

Motifs :

- modèle open-weight sous licence Apache-2.0 ;
- ~27,8 milliards de paramètres ;
- architecture Qwen récente (`qwen3_5`) ;
- multimodal ;
- compatible Transformers ;
- suffisamment ouvert pour permettre QLoRA/SFT et réentraînement des adaptateurs MEL.

### Travail à réaliser

1. Vérifier précisément l'architecture, les modules LoRA cibles, le tokenizer et le chat template.
2. Créer un trainer QLoRA Qwen séparé : ne pas modifier le trainer Mistral pendant sa validation.
3. Évaluer les besoins VRAM réels et trouver un chemin GPU gratuit/reproductible adapté.
4. Porter le corpus MEL sans perte : socle principal + données agentiques + jeux de benchmark.
5. Définir une suite de migration : raisonnement, outils, mémoire, long contexte, multimodal, sur-refus, robustesse JSON et autonomie.
6. Entraîner un smoke Qwen avant tout run massif.
7. Comparer MEL v2 à MEL v1 sur les mêmes tâches.
8. Ne promouvoir Qwen que si les gains sont réels et si les comportements essentiels de MEL sont conservés.
9. Conserver un rollback complet vers le modèle précédent.

### Contrainte GPU déjà identifiée

Un modèle d'environ 27,8B paramètres occupe déjà ~13,9 Go pour les seuls poids théoriques à 4 bits avant activations, états d'entraînement, buffers et adaptateurs. Le T4 15 Go utilisé pour le smoke Mistral n'est donc pas une cible réaliste pour un QLoRA 27B confortable. La recherche d'un GPU gratuit plus adapté fait partie de cette phase.

## MEL v3+ — moteur remplaçable

**Statut : PLANNED**

À terme, le Model Registry / Model Watch doit permettre de tester régulièrement de nouveaux modèles open-weight. Chaque candidat suivra le même protocole :

`benchmark brut -> adaptation MEL -> entraînement agentique -> benchmark complet -> promotion ou rejet -> rollback disponible`

Le but est que MEL puisse changer de cerveau sans perdre son identité, sa mémoire, ses outils, son Council, ses datasets ni son historique d'apprentissage.

## Gates avant premier test autonome complet

La migration de modèle ne remplace pas les gates actuels : CI complète verte, vérification visuelle, benchmark/LoRA Professor, audit exhaustif boutons/fonctions/endpoints/parcours d'autonomie, correction de chaque FAIL, nouveau passage complet des gates et sauvegarde des preuves.

## UX — zone d’échange multimodale

**Statut : PLANNED / P0**

- MEL Normal et MEL Complet doivent accepter le **copier-coller direct de fichiers et d’images depuis le presse-papiers** dans la zone d’échange.
- Le collage doit rejoindre le même pipeline de pièces jointes que le glisser-déposer/sélecteur : aperçu ou nom, taille, suppression avant envoi, multi-fichiers et validation type/taille.
- Le texte collé continue à fonctionner normalement, y compris quand le presse-papiers contient texte + média.
- DONE_VERIFIED exige une preuve navigateur réelle sur les deux modes.

## P0 — fermeture des capacités à 100 %

- **MEL-CAP-01** : la livraison finale ne peut pas être considérée close tant que toutes les capacités enregistrées ne sont pas réellement opérationnelles.
- Baseline observée le 29/09/2026 sur la page Compétences : **143 enregistrées = 105 opérationnelles, 21 dégradées, 17 non configurées, 0 en échec**.
- Groupes visibles à cette baseline : **Cloudflare 3/3, Core 60/60, GitHub 4/5, Google 13/13, MEL 44/59, Vercel 2/3**.
- La cible est dynamique : si de nouvelles capacités sont ajoutées, elles entrent automatiquement dans le dénominateur.
- Critère DONE_VERIFIED : **100 % opérationnelles, 0 dégradée, 0 non configurée, 0 en échec**, avec preuve live réelle par capacité ou par famille homogène quand le probe est partagé; aucun simple flag enabled ne compte comme preuve.
