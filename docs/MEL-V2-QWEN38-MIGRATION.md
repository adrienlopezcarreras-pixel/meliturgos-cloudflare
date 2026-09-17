# MEL v2 — Qwen3.8-27B migration worklog

Status: **IN_PROGRESS / RESEARCH + COMPATIBILITY**

Candidate: `Qwen/Qwen3.8-27B`

## Verified model facts

- Hugging Face model: `Qwen/Qwen3.8-27B`
- License: Apache-2.0
- Parameters: ~27.78B
- Transformers architecture: `Qwen3_5ForConditionalGeneration`
- Model type: `qwen3_5`
- Multimodal: text + image/video tokens; `language_model_only=false`
- Text hidden size: 5120
- Text layers: 64
- Attention heads: 24; KV heads: 4
- Native max position embeddings in config: 262,144
- Hybrid layer stack: repeated linear-attention layers plus full-attention layers
- Vision tower present; MEL text SFT must avoid unintentionally adapting the vision tower until a multimodal training plan is explicitly tested.

## Compatibility gap versus current MEL trainer

Current `scripts/train-mel-lora.py` is intentionally pinned to:

- base model `mistralai/Mistral-7B-Instruct-v0.2`
- Cloudflare runtime `@cf/mistral/mistral-7b-instruct-v0.2-lora`
- target modules `q_proj`, `v_proj`
- causal-LM loader and Mistral-specific adapter metadata

Therefore the Qwen migration must be implemented in a **separate trainer first**. Do not relax the Mistral fail-closed pin while the current Mistral smoke/full pipeline is being validated.

## Preliminary LoRA target study

Qwen3.8 uses a hybrid attention stack. Existing Qwen3.8 LoRA adapters show language-model targets including:

- full-attention / MLP: `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`
- linear-attention: `in_proj_qkv`, `in_proj_z`, `in_proj_a`, `in_proj_b`, `out_proj`

This is a **candidate target set**, not yet an approved MEL configuration. Before training, enumerate actual module names from the loaded model and fail closed if expected modules are absent or if vision/projector modules would be adapted accidentally.

For the first MEL v2 smoke, prefer language-model-only LoRA. Vision/projector training is a later, separate experiment.

## GPU feasibility

Raw 4-bit storage for 27.78B parameters is about 13.9 GB before quantization metadata, activations, gradients, optimizer state, CUDA workspace and LoRA tensors. A 15 GB T4 is therefore not a practical target for a comfortable 27B QLoRA run.

Required work:

1. benchmark exact load-only VRAM in 4-bit;
2. test low sequence lengths and gradient checkpointing;
3. evaluate CPU/offload only as a fallback, not as the preferred full-run path;
4. search for free/reproducible >=24 GB GPU paths, ideally 40 GB+ for less fragile training;
5. checkpoint frequently so a free/preemptible session can resume.

## Data migration policy

The model change must not change MEL's data strategy.

Sequence:

1. baseline Qwen benchmark before MEL adaptation;
2. MEL foundation SFT / QLoRA;
3. agentic-reasoning layer;
4. replay of the foundation corpus during the agentic stage to limit catastrophic forgetting;
5. optional preference stage only after dataset audit;
6. Professor benchmark and promotion gate.

Portable assets to preserve:

- main MEL conversation corpus;
- agentic/reasoning datasets;
- benchmark prompts and expected behaviors;
- memory and knowledge graph;
- Council IA/orchestrator behavior;
- tool schemas and capability bus;
- evaluation evidence and rollback metadata.

## MEL v2 benchmark matrix

A Qwen adapter is not promoted until it is compared with MEL v1 on at least:

- instruction following;
- multi-step planning;
- alternative generation and solution choice;
- tool selection/function calling;
- recovery after a failed tool/action;
- research/verification behavior;
- structured JSON validity;
- long-context retention;
- multilingual French/English behavior;
- over-refusal/non-regression behavior on legitimate sensitive, scientific, historical and pedagogical prompts;
- operational action boundaries through Council/orchestrator;
- latency, VRAM and cost;
- multimodal image understanding once that path is enabled.

## First implementation milestones

- [x] Candidate recorded in MEL development roadmap.
- [x] Model metadata and architecture inspected.
- [x] Current trainer incompatibilities identified.
- [x] Preliminary language-model LoRA target families identified.
- [ ] Add a Qwen-specific compatibility probe that enumerates trainable target modules without starting training.
- [ ] Add Qwen smoke trainer with separate evidence schema/model id.
- [ ] Add 50-example no-train preprocessing test.
- [ ] Add 50–100-example GPU smoke when suitable hardware is available.
- [ ] Measure VRAM and throughput.
- [ ] Run baseline vs adapter Professor benchmark.
- [ ] Only then plan the large MEL v2 run.

## Non-regression rule

MEL v2 is a candidate, not a replacement by declaration. If it loses essential MEL behavior, tool reliability, memory integration or benchmark quality, it remains unpromoted and MEL v1 stays active.
