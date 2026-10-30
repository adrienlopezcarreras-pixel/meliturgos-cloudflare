# MEL Mistral 7B — Independent model evaluation (2026-10-30)

## Scope
Assess user-supplied third-party Mistral models without changing MEL's existing Kaggle-trained LoRA, runtime, safety controls, or AGENTIC pipeline. This document does **not** authorize deployment, weight merging, distillation, or automatic dataset import.

## Candidate references
| Source | Link | Candidate role | Validation required |
| --- | --- | --- | --- |
| Andycurrent GGUF | https://huggingface.co/Andycurrent/Mistral-7B-Uncensored-GGUF | Inference-only, quantized | Source weight lineage, license, quantization, provenance |
| luvGPT Mistral | https://huggingface.co/luvGPT/mistral-7b-uncensored | Separate inference baseline | Parent model identity, model card, tokenizer, license, benchmarks |
| Dolphin 2.6 | https://localaimaster.com/models/dolphin-2-6-mistral-7b | Separate baseline | Original upstream model, source version and license |
| Ollama Dolphin Mistral | https://ollama.com/library/dolphin-mistral:7b-v2-q3_K_S | Quantized inference baseline | Exact tag/digest, lineage, quantization impacts |
| Featherless Mistral | https://featherless.ai/models/hugfacee11/mistral-7b-uncensored | Hosted inference baseline | Provider identity, privacy, model revision, pricing |

## Existing MEL baseline
- `mistralai/Mistral-7B-Instruct-v0.2` with Cloudflare `@cf/mistral/mistral-7b-instruct-v0.2-lora`.
- Do **not** assume an adapter trained against v0.2 is valid on a separately fine-tuned Mistral base or v0.1.
- A model serving endpoint or GGUF file is not an SFT dataset.
- Keep checkpoint digests, training evidence, benchmark evidence, and runtime activation as separate gates.
- The UI's 67% is two out of three validated pipeline stages, not model answer quality.

## Reproducible evaluation protocol
1. Freeze each baseline's model revision, config, tokenizer, prompt template, decoding parameters, and software version.
2. Create a disjoint, provenance-reviewed test set of legitimate prompts: French and English language, general factual Q&A, coding, reasoning, history, sensitive-but-permitted topics, and calibrated uncertainty.
3. Evaluate correctness and completeness; count unjustified refusals on allowed prompts separately from unsafe assistance.
4. Record output latency, context limits, VRAM, per-example judgments, random seeds, and aggregate uncertainty intervals.
5. Compare against MEL's C025 candidate and a clean base model; do not treat a single self-reported model-card metric as proof.
6. Audit whether C001–C025 actually link each adapter to the preceding parent digest; if unknown, mark lineage unverified.
7. Require a canonical benchmark tied to the exact artifact digest and baseline before any new runtime promotion.

## Acceptance
- No regressions on factual correctness, coding, multilingual tasks, or validated safety evaluations.
- Reduced *unjustified* refusals on benign/sensitive legitimate requests.
- Reproducible tests and fully traceable artifacts.
- Human approval before any activation; AGENTIC excluded.
- "100% complete" means the evaluation protocol and evidence requirements are completed, **not** that a model answers every possible query.

## Current verification state
Candidate URLs are inventory entries only. This document does not certify third-party claims or state that downloads, comparisons, and GPU runs have occurred.
