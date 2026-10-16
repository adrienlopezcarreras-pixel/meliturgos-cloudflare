# MEL automated AI content revenue pipeline

## Goal
Build a low-touch content pipeline that creates original, licenseable digital assets and earns royalties through established marketplaces. No direct buyer support or custom service delivery is intended.

## Initial channel to validate: Adobe Stock
- Adobe Stock currently accepts AI-generated images, illustrations, vectors and videos when the contributor has the necessary commercial rights and labels the content correctly.
- Official guidance updated 2026-09-02 requires AI disclosure and quality/legal review; similar prompt iterations should not be bulk-submitted as spam. AI content depicting identifiable real people or property can require releases.
- Official royalties page currently lists 33% for images/vectors/illustrations and 35% for video; examples shown on the page vary widely with buyer plan, from about $0.33 to $3.30 for image downloads and several dollars for stock video under the displayed US plans. Actual royalties vary; those examples are not a forecast or guarantee.
- Official refs: https://helpx.adobe.com/fr/stock/contributor/submit-your-content/submit-generative-ai-content/generative-ai-content-guidelines.html ; https://contributor.stock.adobe.com/fr/royalties

## Pipeline
1. Demand research: identify under-served, licenseable subjects rather than blindly following trends; maintain source notes and a reject list.
2. Brief generation: produce asset briefs with a distinct use case, aspect ratio, copy-space, palette, subject and licensing-safe prompt.
3. Generation: batch-create assets only through tools whose terms permit stock licensing.
4. Automatic QA: inspect dimensions, artifacts, repeated images, near-duplicates, malformed anatomy, accidental text/logos, misleading realism and similarity to existing batch assets.
5. Rights and policy gate: require AI labels, clear fictional-person/property markings where relevant, no unlicensed real people/brands/copyrighted characters/artists, and an auditable record of generation tool and terms.
6. Metadata: create concise accurate titles and keywords; disallow hallucinated people, brands, current events, artists, fictional characters or unsupported claims.
7. Package: export accepted assets and metadata to a review/submission batch; never bypass platform anti-spam rules, access controls or rate limits. Integrate direct submission only where the platform explicitly supports and permits it.
8. Revenue reconciliation: track submitted, accepted, rejected, licensed, royalty credited, payout-threshold met and funds actually received as distinct states.
9. Feedback loop: use acceptance/rejection and licensing performance to steer future briefs. Avoid mass-producing low-quality near-duplicates.

## First experiment
- Choose one asset family: abstract motion backgrounds/loops OR a distinctive set of editorial-safe vector patterns; do not start with multiple categories.
- Produce a small batch, not a bulk upload. Use the platform's current submission rules and inspect every asset before submission.
- Measure acceptance rate, time/cost per accepted asset, licences per accepted asset, and net royalty after generation and storage costs.
- Scale only if evidence shows positive net contribution and there is no policy-risk signal.

## Financial truth
Revenue is royalty-driven, not guaranteed per generated file. Most assets may receive few or no downloads. The right unit is net royalty per accepted asset over time, not number of prompts, generated files or uploads.

## Automation boundaries
Generation, metadata drafting, duplicate detection, QA scoring, batch packaging and royalty bookkeeping can be automated. Account onboarding, rights attestations and any marketplace submission flow must follow the platform's approved process. Keep human review at the initial legal/policy gate until the pipeline has a proven, auditable error rate.

## Acceptance criteria
- No asset is automatically submitted without passing technical, uniqueness, rights and metadata checks.
- AI-generated content is labeled as required by the platform.
- No unlicensed likeness, brand, copyrighted character, artist reference or fabricated current-event claim.
- No unsupported claim that a generated asset is saleable or has earned money.
- A claimed earning is counted as revenue only when the marketplace reports/credits the royalty; cash income only when paid out.