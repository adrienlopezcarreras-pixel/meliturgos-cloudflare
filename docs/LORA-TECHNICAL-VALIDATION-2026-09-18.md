# MEL — Validation technique LoRA du 18 septembre 2026

## Verdict

Le mécanisme LoRA/QLoRA de MEL est techniquement validé. Cette validation ne signifie pas que l’adapter du probe doit être activé en production.

## Preuve observée

- GitHub Actions : run `35370695630`, tentative 2.
- Commit du probe : `c8ff32e4bd011701becb550e2033aaefacce3de2`.
- GPU : NVIDIA Tesla T4.
- Mode : QLoRA 4-bit NF4.
- Modules entraînables : `q_proj` et `v_proj`, rang 8.
- `TRAINING_STARTED` puis `TRAIN_BEGIN`.
- Premier pas réel : `global_step = 1`.
- Loss : `2.204442024230957`.
- Grad norm : `3.596262216567993`.
- `TRAIN_END` observé dans la progression produite.
- `checkpoint-1/optimizer.pt` et `checkpoint-1/trainer_state.json` produits.
- `adapter_model.safetensors` produit, taille 13 648 432 octets.
- Digest adapter : `sha256:06ba3f0485e91c6ef1af2f64e9bd744bf1c5f1b298f77cb171cf59d27245b295`.

## Interprétation canonique

1. `TRAINING_STARTED` et `TRAIN_BEGIN` prouvent que le Trainer a démarré, pas encore qu’un update a eu lieu.
2. `STEP global_step >= 1` + loss numérique prouvent qu’un pas d’optimisation a réellement été exécuté.
3. La présence de `adapter_model.safetensors` prouve que les poids LoRA ont été persistés.
4. Le probe 1-step valide donc le mécanisme d’entraînement.
5. Il ne valide pas la qualité d’un adapter final, qui reste soumise à entraînement complet, provenance exacte, benchmark base/adaptateur et promotion explicite.

## Configuration autonome conservée

- Tick autonome léger : toutes les minutes.
- Heartbeat LoRA : appelé par le tick minute, déclenchement admissible toutes les 15 minutes.
- Backoff LoRA après échec : 60 minutes.
- Veille écosystème + maintenance : toutes les heures à H:17.
- Zéro fallback payant implicite.

## Rationalisation après le probe

Le mode probe 1-step est retiré du chemin d’entraînement normal. Le pipeline normal reprend :
- longueur maximale 512 ;
- accumulation de gradients 8 ;
- entraînement piloté par epochs ;
- benchmark local réactivé ;
- sauvegarde finale et chaîne de provenance conservées.

La capacité `--max-steps` reste disponible dans le trainer pour de futurs diagnostics bornés, sans devenir la configuration normale.
