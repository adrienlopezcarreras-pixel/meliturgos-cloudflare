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
      <b>Routage et secours</b><span class="tag warn">À développer et prouver</span>
      <small>Quand UNCENSORED est activé : modèle prioritaire, puis l'autre uniquement sur erreur, timeout ou réponse vide. Même conversation, limite de temps globale, traces du modèle réellement utilisé.</small>
      <small>Jamais de retour silencieux vers un modèle normal ni de faux reçu LoRA.</small>
    </div>
  </div>
  <div class="status-row"><span>Corpus commun</span><strong>Conversation MEL, ShareGPT dédupliqué, code, outils, raisonnement FR/EN, cas sensibles légitimes</strong></div>
  <div class="status-row"><span>Différences</span><strong>Tokenizers, templates, paramètres, checkpoints et adaptateurs séparés</strong></div>
  <div class="status-row"><span>Validation</span><strong>Qualité, sur-refus, limites de sécurité, JSON/outils, code et absence de régression</strong></div>
  <div class="status-row"><span>Infrastructure</span><strong>Mistral : Workers AI · Qwen3 : hébergeur LoRA compatible à confirmer</strong></div>
  <p class="footer-note">Planification uniquement : les liens ne lancent pas d'entraînement, ne créent pas de checkpoint et n'autorisent pas d'activation. Le bouton « Lancer un entraînement » ci-dessus concerne toujours Mistral.</p>
  <details style="margin-top:15px">
    <summary style="cursor:pointer;font-weight:700">Sources et notebooks à intégrer (8 ressources)</summary>
    <ul style="margin:9px 0 0;padding-left:20px;line-height:1.45">${resourceMarkup}</ul>
  </details>
</article>`;
