# MEL finalization protocol

This protocol prevents a verified implementation from remaining indefinitely in `PARTIAL`, `IN_PROGRESS`, or `WAITING_TEACHER` because review metadata changes the candidate SHA.

## 1. Separate executable code from Teacher transport metadata

- The only executable candidate branch is `candidate/mel-clean-autonomy`.
- Runtime Teacher requests, replies, completion records, and operational review metadata must use `teacher-bridge/runtime`.
- Never write a runtime request, Teacher reply, completion record, checkpoint, or other recurring transport metadata to `candidate/mel-clean-autonomy`.
- `MEL_TEACHER_BRANCH` continues to identify the canonical code branch under review. `MEL_TEACHER_TRANSPORT_BRANCH` identifies only the metadata transport branch.
- A Teacher approval is always about the exact candidate code SHA recorded in the request, not about the SHA of the transport branch.

## 2. Freeze the candidate while an exact-SHA review is being closed

Once a runtime request has been created for candidate SHA `H`:

1. do not add unrelated commits to the candidate while that request is awaiting Teacher reconciliation;
2. write review traffic only to the transport branch;
3. if candidate HEAD is no longer `H`, treat the request as stale, do not approve it, requeue/regenerate the request against the new current HEAD, then freeze that HEAD for the review;
4. never weaken exact-SHA validation just to make an old approval pass.

This avoids the old self-invalidating loop where writing the request or reply itself advanced the candidate branch.

## 3. Distinguish candidate completion from product finalization

A development job can be `COMPLETED` at candidate level without the roadmap item being `DONE_VERIFIED`.

For any roadmap item whose acceptance criteria require production/runtime evidence, finalization is a separate closure phase:

`candidate implementation -> targeted tests -> exact-SHA full CI -> Teacher reconciliation when required -> exact-SHA promotion authorization -> release fast-forward -> deployment success -> live runtime smoke/proof -> roadmap reconciliation`

Do not mark `DONE_VERIFIED` before all acceptance criteria that actually require production proof are present.

## 4. Maintain an explicit closure debt

If code is finished but product closure is not, record the remaining closure reason instead of silently dropping the item from work selection. Valid examples include:

- `AWAITING_TEACHER_EXACT_SHA`
- `AWAITING_PRODUCTION_AUTHORIZATION`
- `AWAITING_DEPLOYMENT`
- `AWAITING_LIVE_SMOKE`
- `AWAITING_ROADMAP_RECONCILIATION`
- `BLOCKED_EXTERNAL`
- `BLOCKED_HUMAN`

A candidate-completed item with one of these remaining conditions is closure debt, not new implementation work. It must not be redeveloped from zero and must not disappear merely because the underlying candidate job is `COMPLETED`.

## 5. Promotion rule

When production promotion is authorized:

- promote only the exact candidate SHA whose full candidate CI is green;
- require the release branch to be a clean fast-forward or otherwise explicitly reconcile divergence before deployment;
- never use force to hide release divergence;
- verify the deploy workflow used that same SHA;
- run the live production smoke after deployment;
- only then reconcile product-level roadmap status.

If production promotion is not authorized, preserve the verified candidate result and mark only the remaining production closure dependency. Do not restart implementation on later autonomy cycles.

## 6. Recovery from a stale pending request

When an existing pending Teacher request references an older candidate SHA:

1. respond `NEEDS_CHANGES` with evidence that the request SHA is stale;
2. allow the runtime to requeue/regenerate the request against current candidate HEAD;
3. freeze candidate HEAD;
4. review and respond to the regenerated request through `teacher-bridge/runtime`;
5. continue from that exact SHA instead of opening a parallel roadmap job.

## 7. Truthfulness invariant

- A green targeted test is not full CI.
- Full CI is not production deployment.
- Deployment success is not live functional proof.
- A completed candidate job is not automatically a finished product roadmap item.
- A production-proven roadmap item must not remain `PARTIAL` merely because static bookkeeping was not reconciled.

The finalization loop exists to close precisely these gaps without either exaggerating completion or repeatedly rebuilding already-verified work.
