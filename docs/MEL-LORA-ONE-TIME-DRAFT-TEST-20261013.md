# One-time LoRA checkpoint draft release — 2026-10-13

- Purpose: verify updated `MEL_LORA_RELEASE_TOKEN` through ONE authorized draft-release attempt.
- Input: already recovered Kaggle artifact from GitHub Actions run `38302570850`, never submit new training.
- SHA-256 adapter: `9c9957a6ab31b7c43f4ee0a3699b9d9292cbdd3fd3fd7368ace74657fb83f6aa`.
- Expected historical training source SHA: `635c4786b39b9c3a5458126d64ec7bb726a282e7`.
- Hard rules: fail if tag already exists; create unpublished **draft** only; verify exact source SHA and two asset names and sizes; never activate/publish LoRA, deploy MEL, or enable MAX.
- This diagnostic PR must be closed without merging. Once the single probe completes, remove its workflow to eliminate retriggers.
