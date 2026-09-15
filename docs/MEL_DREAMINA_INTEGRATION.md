# MEL — Dreamina / Volcengine integration

## Scope of this branch

This branch deliberately adds only new files under `src/multimodal/`, `tests/multimodal/`, and this documentation file.

It does **not** modify autonomy, Teacher Bridge, UI/assets, roadmap runtime, Augmentio provider routing, deployment workflows, or the current capability matrix. Those areas are being changed concurrently on other MEL branches and are intentionally left untouched to avoid collisions.

## Official automation path

Dreamina capabilities are exposed for developer automation through ByteDance/Volcengine models such as Seedream/Seedance. The first adapter implemented here targets the Volcengine Ark image-generation endpoint and normalizes its response for MEL.

## Zero-euro rule

The adapter is fail-closed and disabled by default.

A paid request can be sent only when both conditions are true:

1. the adapter is instantiated with `paidAccessEnabled: true`;
2. the individual request contains `approvedPaidCall: true`.

A configured API key alone is therefore insufficient to spend money. No runtime code in this branch enables paid access automatically.

## Current capability

Implemented in this isolated lot:

- common multimodal generation request validation;
- provider capability descriptor;
- explicit paid-provider guard;
- Dreamina/Volcengine Seedream image generation adapter;
- text-to-image and reference-image request normalization;
- normalized output URLs and usage metadata;
- unit tests proving that the network is not reached when approval is absent.

Not wired yet, by design:

- runtime/capability bus registration;
- UI controls;
- autonomy scheduler;
- Teacher Bridge;
- secrets/bindings;
- paid-access approval persistence;
- Seedance video generation.

Those integration points should be added only after the active parallel MEL branches converge, so the adapter can be wired once against the selected runtime baseline instead of creating a merge collision now.

## Integration contract for the later convergence pass

Inject the API credential into `DreaminaVolcengineAdapter`; do not read secrets inside the adapter. Keep `paidAccessEnabled` false unless the owner has explicitly authorized paid use. Runtime code must also require per-call `approvedPaidCall: true` before dispatching a paid generation.
