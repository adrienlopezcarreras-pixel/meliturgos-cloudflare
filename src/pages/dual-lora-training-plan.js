/**
 * Static, evidence-honest training roadmap for two independent MEL models.
 * A resource link is not a verified training artifact.
 * No user/browser supplied adapter IDs enter a runtime request here.
 */
export const MEL_DUAL_LORA_MODELS = Object.freeze([
  Object.freeze({
    id: 'mistral-7b',
    base_model: 'mistralai/Mistral-7B-Instruct-v0.2',
    runtime_model: '@cf/mistral/mistral-7b-instruct-v0.2-lora',
    training: 'Kaggle GPU gratuit; QLoRA 4-bit; pipeline MEL existant',
    activation: 'Checkpoint immuable + benchmark + autorisation propriétaire',
    status: 'PIPELINE_EXISTANT',
  }),
  Object.freeze({
    id: 'qwen3-14b',
    base_model: 'Qwen/Qwen3-14B',
    reference_adapter: 'nicoboss/Qwen3-14B-Uncensored-Lora',
    training: 'QLoRA/Unsloth GPU; entraînement et checkpoints indépendants',
    activation: 'Hébergement compatible à choisir; aucune activation automatique',
    status: 'PLANIFIE_NON_ENTRAINE',
  }),
]);

export const MEL_QWEN3_TRAINING_STAGES = Object.freeze([
  Object.freeze({"id":"audit","title":"0 — Qualifier les sources","proof":"Fichier Colab, modèles, données, licences et format Qwen ; source gelée par révision SHA.","status":"À préparer"}),
  Object.freeze({"id":"baseline","title":"1 — Mesurer Qwen3 de base","proof":"Mesures sur questions légitimes sensibles, français, code, JSON, outils, raisonnement, erreurs et latence.","status":"Non mesuré"}),
  Object.freeze({"id":"smoke","title":"2 — Smoke QLoRA GPU","proof":"Expérience courte, CUDA prouvé, pertes et VRAM tracées, bundle PEFT contrôlé et sans promotion.","status":"Non lancé"}),
  Object.freeze({"id":"train","title":"3 — Deux candidats comparables","proof":"Qwen MEL entraîné depuis la base et, séparément, continuation éventuelle de nicoboss ; checkpoints isolés.","status":"Non lancé"}),
  Object.freeze({"id":"eval","title":"4 — Benchmark indépendant","proof":"Jeu de validation absent de l’entraînement ; comparer Mistral, Qwen brut et chaque candidat Qwen.","status":"Non mesuré"}),
  Object.freeze({"id":"serve","title":"5 — Endpoint Qwen3 et budget","proof":"Confirmer fournisseur compatible PEFT, modèle exact chargé, coût plafonné, santé et traces.","status":"Non hébergé"}),
  Object.freeze({"id":"switch","title":"6 — Bascule de secours","proof":"UNCENSORED tente A puis B uniquement sur panne/timeout/vide ; contexte et preuve du LoRA exact conservés.","status":"Non disponible"}),
]);

export const MEL_ABLITERATION_STAGES = Object.freeze([
  Object.freeze({id:'reference',title:'1 — Vérifier le notebook et les sources',proof:'Notebook Colab original, version du modèle de base, licences, jeux de prompts autorisés et SHA du corpus.',status:'À préparer'}),
  Object.freeze({id:'baseline',title:'2 — Mesurer le modèle avant modification',proof:'Évaluation indépendante : qualité FR/EN, raisonnement, code, outils, sur-refus et garde-fous.',status:'Non mesuré'}),
  Object.freeze({id:'experiment',title:'3 — Expérience d’abliteration isolée',proof:'GPU et architecture compatibles, direction mesurée, couches modifiées identifiées, trace et modèle candidat immuable.',status:'Non lancé'}),
  Object.freeze({id:'compare',title:'4 — Comparer au QLoRA et à la base',proof:'Même jeu de validation hors entraînement, coût, pertes de capacité, refus injustifiés, tests de sécurité et régressions.',status:'Non mesuré'}),
  Object.freeze({id:'promotion',title:'5 — Décider de la publication',proof:'Validation humaine, budget approuvé, checkpoint vérifié, service isolé, rollback et preuves runtime avant activation.',status:'Non activé'}),
]);

export const MEL_DUAL_LORA_RESOURCES = Object.freeze([
  Object.freeze({
    id: 'qwen-reference',
    label: 'Adaptateur Qwen3-14B Uncensored (nicoboss)',
    href: 'https://huggingface.co/nicoboss/Qwen3-14B-Uncensored-Lora',
    note: 'Adaptateur PEFT Qwen/Qwen3-14B, dataset Guilherme34/uncensor ; modèle de référence, pas un checkpoint MEL.',
  }),
  Object.freeze({
    id: 'owner-colab',
    label: 'Notebook Colab communiqué',
    href: 'https://colab.research.google.com/drive/1VYm3hOcvCpbGiqKZb141gJwjdmmCcVpR?usp=sharing',
    note: 'Notebook consulté (10 cellules, 6 juin 2024) : abliteration expérimentale de Daredevil-8B avec TransformerLens, pas QLoRA Qwen3. Ne pas exécuter sur Qwen sans portage et benchmark.',
  }),
  Object.freeze({
    id: 'hartford',
    label: 'Eric Hartford — Uncensored Models',
    href: 'https://erichartford.com/uncensored-models',
    note: 'Méthode historique: sélection et nettoyage de jeux de données; à adapter aux modèles actuels.',
  }),
  Object.freeze({
    id: 'abliteration',
    label: 'Maxime Labonne — Abliteration',
    href: 'https://medium.com/@mlabonne/uncensor-any-llm-with-abliteration-d30148b7d43e',
    note: 'Technique alternative, expérimentale; comparer séparément à LoRA et mesurer les régressions.',
  }),
  Object.freeze({
    id: 'qwen-doc',
    label: 'Qwen3 — Documentation Unsloth officielle',
    href: 'https://github.com/QwenLM/Qwen3/blob/main/docs/source/training/unsloth.md',
    note: 'Guide QLoRA Qwen3-14B; surveiller VRAM, contexte et capacités de raisonnement.',
  }),
  Object.freeze({
    id: 'dataset-uncensor',
    label: 'Corpus de référence Guilherme34/uncensor',
    href: 'https://huggingface.co/datasets/Guilherme34/uncensor',
    note: 'Auditer la licence, la provenance, le contenu et les échantillons avant usage.',
  }),
  Object.freeze({
    id: 'sharegpt',
    label: 'ShareGPT Vicuna unfiltered (déjà intégré à MEL)',
    href: 'https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered',
    note: 'Réutiliser la déduplication et les empreintes SHA du pipeline existant.',
  }),
  Object.freeze({"id":"ultrachat","label":"UltraChat Uncensored — corpus déjà exploré dans MEL","href":"https://huggingface.co/datasets/Devilishcode/ultrachat-uncensored","note":"Source complémentaire : audit de licence, sélection, déduplication et exclusion des données à risque avant réemploi."}),
  Object.freeze({"id":"opus","label":"Kalo Opus sans refus — corpus exploré dans MEL","href":"https://huggingface.co/datasets/anthracite-org/kalo-opus-instruct-22k-no-refusal","note":"Comparer la qualité plutôt que considérer « no-refusal » comme une étiquette de réussite."}),
  Object.freeze({"id":"dpo","label":"Préférences ORPO / DPO (mlabonne, 40k)","href":"https://huggingface.co/datasets/mlabonne/orpo-dpo-mix-40k","note":"Expérience préférentielle facultative, distincte du smoke QLoRA. Licences des sources à auditer."}),
  Object.freeze({"id":"dolphin-pr","label":"Corpus Dolphin expérimental de MEL — PR #2819","href":"https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/pull/2819","note":"Expérience Mistral à participation explicite : ne pas assimiler cette PR à un entraînement Qwen3."}),
  Object.freeze({
    id: 'mistral-runtime',
    label: 'Cloudflare — Mistral 7B LoRA',
    href: 'https://developers.cloudflare.com/workers-ai/models/mistral-7b-instruct-v0.2-lora/',
    note: 'Runtime LoRA existant; Qwen3 ne s’y substitue pas sans fournisseur compatible.',
  }),
]);

const safe = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const resourceMarkup = MEL_DUAL_LORA_RESOURCES.map(({label, href, note}) =>
  `<li style="margin:9px 0"><a target="_blank" rel="noopener noreferrer" href="${safe(href)}">${safe(label)}</a><small style="display:block;color:var(--muted);margin-top:3px">${safe(note)}</small></li>`
).join('');

const abliterationMarkup = MEL_ABLITERATION_STAGES.map(({title,proof,status}) =>
  `<li style="margin:10px 0"><b>${safe(title)}</b> <span class="tag warn">${safe(status)}</span><small style="display:block;color:var(--muted);margin-top:4px">${safe(proof)}</small></li>`
).join('');

const stagesMarkup = MEL_QWEN3_TRAINING_STAGES.map(({title,proof,status}) =>
  `<li style="margin:10px 0"><b>${safe(title)}</b> <span class="tag warn">${safe(status)}</span><small style="display:block;color:var(--muted);margin-top:4px">${safe(proof)}</small></li>`
).join('');
export const MEL_DUAL_LORA_TRAINING_MARKUP = `
<article class="card wide" id="dualLoraTrainingPlan" aria-labelledby="dualLoraTitle">
  <div class="skill-head">
    <div><h2 id="dualLoraTitle">Deux modèles UNCENSORED — feuille de route</h2>
      <p class="muted" style="margin:6px 0 0">Deux entraînements indépendants, un seul bouton UNCENSORED et un secours automatique lorsque les deux runtimes sont réellement disponibles.</p></div>
    <span class="tag warn">Qwen3 : planifié, non activé</span>
  </div>
  <div class="lora-steps" style="margin-top:16px">
    <div class="lora-step">
      <b>Modèle A — Mistral 7B</b><span class="tag">Pipeline existant</span>
      <small>QLoRA Kaggle gratuit ; conserver checkpoints, corpus MEL, preuves et benchmarks. Statut réel dans le panneau supérieur.</small>
      <small><code>mistralai/Mistral-7B-Instruct-v0.2</code></small>
    </div>
    <div class="lora-step">
      <b>Modèle B — Qwen3 14B</b><span class="tag warn">À entraîner</span>
      <small>QLoRA 4-bit/Unsloth, GPU gratuit si disponible. Nouvelle lignée et nouveau benchmark; ne jamais appliquer le LoRA Qwen à Mistral.</small>
      <small><code>Qwen/Qwen3-14B</code></small>
    </div>
    <div class="lora-step">
      <b>Routage et secours</b><span class="tag warn">Code prêt · service Qwen non activé</span>
      <small>Quand UNCENSORED est activé : Mistral d’abord, puis Qwen si erreur, timeout ou réponse vide (ou Qwen seul si Mistral absent). Le mécanisme est codé mais exige un adaptateur Qwen validé et un service cloud dédié.</small>
      <small>Jamais de retour silencieux vers un modèle normal ni de faux reçu LoRA.</small>
    </div>
  </div>
  <section aria-labelledby="abliterationTrainingTitle" style="margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:12px">
    <div class="skill-head">
      <div>
        <h3 id="abliterationTrainingTitle">Expérience C — Abliteration (distincte du QLoRA)</h3>
        <p class="muted" style="margin-top:6px">Le notebook fourni modifie les directions de refus d'un modèle Daredevil-8B. Aucun résultat sur MEL/Qwen3 n'est prouvé. Ce parcours expérimental est isolé des checkpoints Mistral et Qwen.</p>
      </div>
      <span class="tag warn" id="abliterationTrainingState">Non lancé · aucune trace GPU</span>
    </div>
    <div class="lora-progress-label"><span>Avancement vérifié de l'expérience</span><strong id="abliterationProgressText">Non mesuré</strong></div>
    <div class="progress" role="progressbar" aria-label="Étapes d'abliteration réellement prouvées" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0"><span style="width:0%"></span></div>
    <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">Parcours expérimental (5 jalons)</summary><ol style="padding-left:24px">${abliterationMarkup}</ol></details>
    <div class="actions" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button type="button" id="abliterationPreflight">Lancer la prévalidation Abliteration</button>
      <button type="button" id="abliterationRefresh">Actualiser le dernier run</button>
      <span id="abliterationPreflightResult" role="status" aria-live="polite">Aucune prévalidation demandée</span>
      <a class="button lora-link" target="_blank" rel="noopener noreferrer" href="https://colab.research.google.com/drive/1VYm3hOcvCpbGiqKZb141gJwjdmmCcVpR?usp=sharing">Ouvrir le notebook d'abliteration</a>
      <a class="button lora-link" target="_blank" rel="noopener noreferrer" href="https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions">Consulter les preuves GitHub</a>
    </div>
    <small class="muted">Aucune commande automatique ni suivi GPU live n'est encore connecté à cette expérience. Un notebook ouvert ne constitue pas une preuve d'exécution.</small>
  </section>
  <section aria-labelledby="qwenTrainingStatusTitle" style="margin-top:16px;padding:14px;border:1px solid var(--line);border-radius:12px">
    <div class="skill-head">
      <div><h3 id="qwenTrainingStatusTitle">Modèle B — Qwen3 14B : progression et preuves</h3><p class="muted" style="margin-top:6px">Exécuteur GPU non raccordé au panneau. Le script d'entraînement existe, mais aucune progression d'apprentissage Qwen n'est attestée.</p></div>
      <span class="tag warn" id="qwenTrainingState">Non lancé · entraînement GPU non prouvé</span>
    </div>
    <div class="lora-progress-label"><span>Progression GPU attestée</span><strong id="qwenTrainingProgressText">Non disponible</strong></div>
    <div class="status-row"><span>Dernier entraînement confirmé</span><strong id="qwenTrainingLastRun">Aucun run GPU vérifié</strong></div>
    <div class="status-row"><span>Checkpoint candidat</span><strong id="qwenTrainingCheckpoint">Aucun artefact PEFT vérifié</strong></div>
    <div class="status-row"><span>Évaluation indépendante</span><strong id="qwenTrainingBenchmark">Non mesurée</strong></div>
    <div class="actions" style="margin-top:12px">
      <button type="button" id="qwenPreflight">Lancer la prévalidation Qwen3</button>
      <button type="button" id="qwenRefresh">Actualiser le dernier run</button>
      <span id="qwenPreflightResult" role="status" aria-live="polite">Aucune prévalidation demandée</span>
      <a class="button lora-link" href="https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/blob/main/scripts/train-qwen3-lora.py" target="_blank" rel="noopener noreferrer">Consulter le trainer Qwen</a></div>
    <small class="muted">Aucun bouton de lancement n'est présenté comme opérationnel tant que le dispatch GPU authentifié, le suivi et la conservation des preuves ne sont pas raccordés.</small>
  </section>
  <details open style="margin-top:16px">
    <summary style="cursor:pointer;font-weight:700">Plan de travail du nouveau Qwen3-14B (7 jalons)</summary>
    <ol style="margin:10px 0 0;padding-left:24px;line-height:1.45">${stagesMarkup}</ol>
  </details>
  <details style="margin-top:13px">
    <summary style="cursor:pointer;font-weight:700">Recette QLoRA et paramètres proposés</summary>
    <div class="status-row"><span>Référence nicoboss (historique, non MEL)</span><strong>2 × RTX 4090 24 Go ; QLoRA 4-bit ; r=32 ; alpha=16 ; dropout=0,05 ; longueur 4096 ; 4 epochs ; LR 2e-4. Ce n'est pas une garantie T4.</strong></div>
    <div class="status-row"><span>Premier essai MEL (hypothèse à valider)</span><strong>Unsloth ; Qwen3-14B ; NF4 ; r=16 ; alpha=32 ; dropout=0,05 ; longueur 512 à 1024 ; batch=1 ; accumulation=8 ; 1 epoch, maximum 50 steps et gradient checkpointing.</strong></div>
    <div class="status-row"><span>Formats et études</span><strong>Chat template Qwen3, messages avec rôles, séparation train/eval, masquage des messages utilisateur quand supporté, mesure de conservation du raisonnement et essais base vs continuation.</strong></div>
    <div class="status-row"><span>Données candidates</span><strong>MEL validé et dépersonnalisé, ShareGPT dédupliqué, Guilherme34/uncensor à auditer, UltraChat, Opus ; préférences ORPO/DPO en branche distincte ; Dolphin reste une expérience Mistral.</strong></div>
  </details>
  <div class="status-row"><span>Corpus commun</span><strong>Conversation MEL, ShareGPT dédupliqué, code, outils, raisonnement FR/EN, cas sensibles légitimes</strong></div>
  <div class="status-row"><span>Différences</span><strong>Tokenizers, templates, paramètres, checkpoints et adaptateurs séparés</strong></div>
  <div class="status-row"><span>Validation</span><strong>Qualité, sur-refus, limites de sécurité, JSON/outils, code et absence de régression</strong></div>
  <div class="status-row"><span>Infrastructure</span><strong>Mistral : Workers AI · Qwen3 : hébergeur LoRA compatible à confirmer</strong></div>
  <p class="footer-note">Le point d’entrée GPU Qwen existe dans <code>scripts/train-qwen3-lora.py</code>, mais aucun entraînement n’a été exécuté ici. Les liens ne lancent rien. Le bouton « Lancer un entraînement » ci-dessus concerne toujours Mistral.</p>
  <details style="margin-top:15px">
    <summary style="cursor:pointer;font-weight:700">Sources et notebooks à intégrer (12 ressources)</summary>
    <ul style="margin:9px 0 0;padding-left:20px;line-height:1.45">${resourceMarkup}</ul>
  </details>
</article>`;
