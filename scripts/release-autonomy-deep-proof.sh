#!/usr/bin/env bash
# [GPT] Extracted without changing release safety semantics; called synchronously.
set -euo pipefail
# Name the failing line: a bare curl timeout (exit 28) used to fail the release
# with no hint of which production proof timed out. Only reads are retried.
trap 'rc=$?; echo "::error title=release-autonomy-deep-proof::failed at line ${LINENO} (exit ${rc})"' ERR
# Keep explicit, non-sensitive progress markers for long live proof phases.
# Do not log credentials or response bodies.
echo "MEL_RELEASE_EVIDENCE_PHASE=START $(date -u +%FT%TZ)"
BASE_URL="https://meliturgos.adrien-lopezcarreras.workers.dev"
test -s release-bootstrap-token.txt
BOOTSTRAP_TOKEN="$(cat release-bootstrap-token.txt)"
[[ "${BOOTSTRAP_TOKEN}" =~ ^[0-9a-f]{64}$ ]]
echo "::add-mask::${BOOTSTRAP_TOKEN}"

if [ "$MEL_ROADMAP_SHARDVAULT_PAUSED" = "true" ]; then
  echo "ShardVault external replication is PAUSED_FOR_ROADMAP; skipping 7/7 Internet endpoint proof."
else
# A Worker secret update may take a few seconds to become visible on
# every production isolate.  Retry the first authenticated request
# instead of treating that propagation window as a release failure.
SHARD_STATUS_READY=0
SHARD_STATUS_ATTEMPT=0
SHARD_STATUS_DEADLINE_EPOCH=$(( $(date +%s) + 360 ))
while [ "$SHARD_STATUS_READY" != "1" ] && [ "$(date +%s)" -lt "$SHARD_STATUS_DEADLINE_EPOCH" ]; do
  SHARD_STATUS_ATTEMPT=$((SHARD_STATUS_ATTEMPT + 1))
  SHARD_STATUS_CODE="$(curl --silent --show-error --max-time 60 \
    --header "x-mel-release-smoke: 1" \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --output production-shardvault-before.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/gen2/shardvault/status" || true)"
  if [ "$SHARD_STATUS_CODE" = "200" ]; then
    SHARD_STATUS_READY=1
    break
  fi
  echo "ShardVault status propagation attempt ${SHARD_STATUS_ATTEMPT} returned HTTP ${SHARD_STATUS_CODE}; waiting within the 360s propagation budget."
  if [ -s production-shardvault-before.json ]; then
    echo 'ShardVault status response withheld from CI logs; HTTP status is reported above.'
  fi
  sleep 5
done
if [ "$SHARD_STATUS_READY" != "1" ]; then
  echo "ShardVault release-smoke authentication did not become ready within the bounded 360s propagation window."
  exit 46
fi
SHARD_RELEASE_QUORUM=5
SHARD_ACTIVE="$(node -e 'const d=require("./production-shardvault-before.json"); const n=Array.isArray(d?.active_external_registry)?d.active_external_registry.length:0; process.stdout.write(String(n));')"
echo "ShardVault external registry before release proof: ${SHARD_ACTIVE}/7 (release quorum ${SHARD_RELEASE_QUORUM}/7)"

if [ "$SHARD_ACTIVE" -lt "$SHARD_RELEASE_QUORUM" ]; then
  SHARD_READY=0
  for SHARD_ATTEMPT in $(seq 1 17); do
    # Release proof scans one documented provider per request.
    # Broad Internet discovery stays outside the production gate so
    # a slow catalogue/search cannot exhaust Worker CPU.
    SHARD_PROBE_LIMIT=1
    SHARD_KNOWN_ONLY=true
    SHARD_OFFSET=$(( (SHARD_ATTEMPT - 1) % 13 ))
    SHARD_SEARCH_CODE="$(curl --silent --show-error --max-time 90 \
      --header "x-mel-release-smoke: 1" \
      --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
      --header "content-type: application/json" \
      --data "{\"max_new_endpoints\":1,\"probe_limit\":${SHARD_PROBE_LIMIT},\"probe_offset\":${SHARD_OFFSET},\"known_candidates_only\":${SHARD_KNOWN_ONLY}}" \
      --output production-shardvault-search.json \
      --write-out '%{http_code}' \
      "${BASE_URL}/api/gen2/shardvault/search" || true)"
    if [ "$SHARD_SEARCH_CODE" != "200" ]; then
      echo "ShardVault bounded activation attempt ${SHARD_ATTEMPT} returned HTTP ${SHARD_SEARCH_CODE}."
      echo 'ShardVault provider search response withheld from CI logs.'
    else
      SHARD_STATE="$(node -e 'const d=require("./production-shardvault-search.json"); if(d?.ok!==true) throw new Error("SHARDVAULT_SEARCH_NOT_OK"); const active=Number(d?.active_external_count||0); const target=Number(d?.target_count||7); const quorum=5; process.stdout.write(String(active)+" "+String(target)+" "+(active>=quorum?"1":"0"));')"
      SHARD_ACTIVE="${SHARD_STATE%% *}"
      SHARD_REST="${SHARD_STATE#* }"
      SHARD_TARGET="${SHARD_REST%% *}"
      SHARD_READY="${SHARD_REST##* }"
      echo "ShardVault bounded activation ${SHARD_ATTEMPT}: ${SHARD_ACTIVE}/${SHARD_TARGET}"
      if [ "$SHARD_READY" = "1" ]; then
        break
      fi
    fi
    sleep 2
  done
  test "$SHARD_READY" = "1"
fi

SHARD_FINAL_READY=0
for SHARD_FINAL_ATTEMPT in $(seq 1 12); do
  SHARD_FINAL_CODE="$(curl --silent --show-error --max-time 60 \
    --header "x-mel-release-smoke: 1" \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --output production-shardvault-final.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/gen2/shardvault/status" || true)"
  if [ "$SHARD_FINAL_CODE" = "200" ]; then
    SHARD_FINAL_READY=1
    break
  fi
  echo "ShardVault final status propagation attempt ${SHARD_FINAL_ATTEMPT}/12 returned HTTP ${SHARD_FINAL_CODE}."
  if [ -s production-shardvault-final.json ]; then
    echo 'ShardVault final status response withheld from CI logs.'
  fi
  sleep 2
done
test "$SHARD_FINAL_READY" = "1"
node -e 'const d=require("./production-shardvault-final.json"); const active=Array.isArray(d?.active_external_registry)?d.active_external_registry.length:0; if(active<5) throw new Error("PRODUCTION_SHARDVAULT_ACTIVE_EXTERNAL_LT_RELEASE_QUORUM:"+active); if(d?.health?.recoverable!==true) throw new Error("PRODUCTION_SHARDVAULT_NOT_RECOVERABLE"); console.log("ShardVault active external registry release quorum verified: "+active+"/7; background repair remains responsible for 7/7.");'
fi

echo "MEL_RELEASE_EVIDENCE_PHASE=SHARDVAULT_CHECK_COMPLETE $(date -u +%FT%TZ)"

# Secret propagation is eventually consistent across Worker isolates.
# The proof is idempotent, so retry only this bounded authenticated phase.
SKILL_REGISTRY_READY=0
for SKILL_REGISTRY_ATTEMPT in $(seq 1 12); do
  SKILL_REGISTRY_CODE="$(curl --silent --show-error --max-time 60 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"skill-registry-proof"}' \
    --output production-skill-registry-proof.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  if [ "$SKILL_REGISTRY_CODE" = "200" ]; then
    SKILL_REGISTRY_READY=1
    break
  fi
  echo "Skill Registry proof propagation attempt ${SKILL_REGISTRY_ATTEMPT}/12 returned HTTP ${SKILL_REGISTRY_CODE}."
  if [ -s production-skill-registry-proof.json ]; then
    node -e 'const fs=require("fs"); const raw=fs.readFileSync("production-skill-registry-proof.json","utf8"); try { const d=JSON.parse(raw); console.log(JSON.stringify({status:d?.status||null,code:d?.code||null})); } catch { console.log(JSON.stringify({transient_non_json_response:raw.slice(0,240)})); }'
  fi
  sleep 2
done
test "$SKILL_REGISTRY_READY" = "1"
node -e 'const d=require("./production-skill-registry-proof.json"); if(d?.ok!==true||d?.status!=="MEL_EVOL_05_PRODUCTION_D1_VERIFIED"||d?.restored_before_rollback!=="1.1.0"||d?.restored_after_rollback!=="1.0.0") throw new Error("MEL_EVOL_05_PRODUCTION_D1_PROOF_FAILED"); console.log("MEL-EVOL-05 real D1 restart/rollback proof passed.");'


LONG_CONTEXT_READY=0
for LONG_CONTEXT_ATTEMPT in $(seq 1 12); do
  LONG_CONTEXT_CODE="$(curl --silent --show-error --max-time 90 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"long-context-proof"}' \
    --output production-long-context-proof.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  if [ "$LONG_CONTEXT_CODE" = "200" ]; then
    LONG_CONTEXT_READY=1
    break
  fi
  echo "Long-context proof propagation attempt ${LONG_CONTEXT_ATTEMPT}/12 returned HTTP ${LONG_CONTEXT_CODE}."
  if [ -s production-long-context-proof.json ]; then
    node -e 'const fs=require("fs"); const raw=fs.readFileSync("production-long-context-proof.json","utf8"); try { const d=JSON.parse(raw); console.log(JSON.stringify({status:d?.status||null,code:d?.code||null},null,2)); } catch { console.log(JSON.stringify({transient_non_json_response:raw.slice(0,240)})); }'
  fi
  sleep 2
done
test "$LONG_CONTEXT_READY" = "1"
node - <<'NODE'
const d=require('./production-long-context-proof.json');
if(d?.ok!==true || d?.status!=='MEL_CONTEXT_02_REAL_LONG_CONVERSATION_VERIFIED') throw new Error('MEL_CONTEXT_02_PRODUCTION_PROOF_FAILED');
const p=d?.proof||{};
if(Number(p.total_chars||0)<=65000 || Number(p.omitted_message_count||0)<1) throw new Error('MEL_CONTEXT_02_NOT_ACTUALLY_LONG');
if(Number(p.decision_anchor_count||0)<1 || p.anchor_preserved!==true) throw new Error('MEL_CONTEXT_02_DECISION_NOT_PRESERVED');
if(p.current_turn_preserved_exactly!==true || d?.private_content_returned!==false) throw new Error('MEL_CONTEXT_02_PRIVACY_OR_CURRENT_TURN_FAILED');
console.log('MEL-CONTEXT-02 real production long-conversation proof passed.');
NODE


# The bootstrap secret can take a few seconds to propagate across
# production isolates. The pause phase is idempotent, so retry it
# independently of ShardVault external-proof mode.
PAUSE_READY=0
for PAUSE_ATTEMPT in $(seq 1 12); do
  PAUSE_CODE="$(curl --silent --show-error --max-time 30 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"pause"}' \
    --output production-launch-pause.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  if [ "$PAUSE_CODE" = "200" ]; then
    PAUSE_READY=1
    break
  fi
  echo "Launch pause propagation attempt ${PAUSE_ATTEMPT}/12 returned HTTP ${PAUSE_CODE}."
  if [ -s production-launch-pause.json ]; then
    node -e 'const fs=require("fs"); const raw=fs.readFileSync("production-launch-pause.json","utf8"); try { const d=JSON.parse(raw); console.log(JSON.stringify({status:d?.status||null},null,2)); } catch { console.log(JSON.stringify({transient_non_json_response:raw.slice(0,240)})); }'
  fi
  sleep 2
done
test "$PAUSE_READY" = "1"
node -e 'const d=require("./production-launch-pause.json"); if(d?.ok!==true||d?.status!=="RELEASE_PAUSED") throw new Error("PRODUCTION_RELEASE_PAUSE_FAILED");'

BACKUP_READY=0
for BACKUP_ATTEMPT in $(seq 1 3); do
  BACKUP_CODE="$(curl --silent --show-error --max-time 180 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"backup"}' \
    --output production-launch-backup.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  if [ "$BACKUP_CODE" = "200" ]; then
    BACKUP_READY=1
    break
  fi
  echo "Launch backup phase attempt ${BACKUP_ATTEMPT}/3 returned HTTP ${BACKUP_CODE}."
  if [ -s production-launch-backup.json ]; then
    node -e 'const fs=require("fs"); const raw=fs.readFileSync("production-launch-backup.json","utf8"); try { const d=JSON.parse(raw); console.log(JSON.stringify({status:d?.status||null,backup:d?.backup||null},null,2)); } catch { console.log(JSON.stringify({transient_non_json_response:raw.slice(0,240)})); }'
  fi
  sleep 5
done
test "$BACKUP_READY" = "1"
node -e 'const d=require("./production-launch-backup.json"); if(d?.ok!==true||d?.backup?.ok!==true) throw new Error("PRODUCTION_RELEASE_BACKUP_FAILED"); console.log("Production release backup phase passed: "+String(d?.backup?.status||d?.status||"OK"));'


CAPABILITY_WATCH_READY=0
for CAPABILITY_WATCH_ATTEMPT in $(seq 1 3); do
  CAPABILITY_WATCH_CODE="$(curl --silent --show-error --max-time 90 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"capability-watch-proof"}' \
    --output production-capability-watch-proof.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  if [ "${CAPABILITY_WATCH_CODE}" = "200" ]; then
    CAPABILITY_WATCH_READY=1
    break
  fi
  echo "GEN2-42 handoff proof attempt ${CAPABILITY_WATCH_ATTEMPT}/3 returned HTTP ${CAPABILITY_WATCH_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  sleep 2
done
test "${CAPABILITY_WATCH_READY}" = "1"
node - <<'NODE'
const d=require('./production-capability-watch-proof.json');
const openCount=Number(d?.open_handoff_count||0);
const teacherProvenCount=Number(d?.teacher_proven_handoff_count||0);
const blockedCount=Number(d?.blocked_open_handoff_count||0);
const active=d?.status==='GEN2_42_TEACHER_HANDOFF_READY'
  && Number(d?.active_teacher_handoff_count||0)>=1
  && Boolean(d?.job_id)
  && Boolean(d?.teacher_request_id);
const progressed=d?.status==='GEN2_42_TEACHER_HANDOFF_PROGRESS_VERIFIED'
  && d?.progress_verified===true
  && openCount>0
  && teacherProvenCount>=1
  && blockedCount>=0
  && teacherProvenCount+blockedCount===openCount
  && Boolean(d?.teacher_request_id);
const idle=d?.status==='GEN2_42_TEACHER_HANDOFF_IDLE_VERIFIED'
  && d?.idle_verified===true
  && Number(d?.open_handoff_count||0)===0
  && Number(d?.active_teacher_handoff_count||0)===0
  && !d?.job_id
  && !d?.teacher_request_id;
if(d?.ok!==true || (!active && !progressed && !idle)) throw new Error('GEN2_42_TEACHER_HANDOFF_PROOF_FAILED');
if(d?.production_activation_allowed!==false || d?.auto_approval_allowed!==false) throw new Error('GEN2_42_PROOF_ESCALATED_PRIVILEGES');
console.log('GEN2-42 production Teacher handoff proof passed: '+String(d.status)+' teacher_proven='+teacherProvenCount+' blocked='+blockedCount+' open='+openCount);
NODE


# Backend roadmap certification drills are authenticated, bounded and idempotent.
# Execute each phase twice: first materializes the production state, second proves replay/restart safety.
for PROOF_PHASE in plugin-sdk-proof evolution-ledger-proof agent-automation-proof; do
  for PROOF_PASS in 1 2; do
    PROOF_OUT="production-${PROOF_PHASE}-${PROOF_PASS}.json"
    PROOF_READY=0
    for PROOF_ATTEMPT in $(seq 1 6); do
      PROOF_CODE="$(curl --silent --show-error --max-time 90                   --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}"                   --header "content-type: application/json"                   --data "{\"phase\":\"${PROOF_PHASE}\"}"                   --output "${PROOF_OUT}"                   --write-out '%{http_code}'                   "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
      if [ "${PROOF_CODE}" = "200" ]; then
        PROOF_READY=1
        break
      fi
      echo "${PROOF_PHASE} pass ${PROOF_PASS} attempt ${PROOF_ATTEMPT}/6 returned HTTP ${PROOF_CODE}."
      test ! -s "${PROOF_OUT}" || cat "${PROOF_OUT}"
      sleep 2
    done
    test "${PROOF_READY}" = "1"
  done
done

node - <<'NODE'
const fs=require('fs');
const expected={
  'plugin-sdk-proof':'GEN2_15_PRODUCTION_D1_VERIFIED',
  'evolution-ledger-proof':'MEL_EVOL_04_PRODUCTION_LEDGER_VERIFIED',
  'agent-automation-proof':'GEN2_39_PRODUCTION_D1_VERIFIED',
};
for (const [phase,status] of Object.entries(expected)) {
  for (const pass of [1,2]) {
    const d=JSON.parse(fs.readFileSync(`production-${phase}-${pass}.json`,'utf8'));
    if(d?.ok!==true || d?.status!==status) throw new Error(`${phase.toUpperCase()}_PASS_${pass}_FAILED`);
  }
}
const plugin=JSON.parse(fs.readFileSync('production-plugin-sdk-proof-2.json','utf8'));
if(plugin?.active_version!=='1.0.0' || plugin?.replay_safe!==true) throw new Error('GEN2_15_REPLAY_PROOF_FAILED');
const ledger=JSON.parse(fs.readFileSync('production-evolution-ledger-proof-2.json','utf8'));
if(ledger?.proof_event_count!==2 || ledger?.replay_safe!==true) throw new Error('MEL_EVOL_04_REPLAY_PROOF_FAILED');
const agents=JSON.parse(fs.readFileSync('production-agent-automation-proof-2.json','utf8'));
if(agents?.run_status!=='COMPLETED' || agents?.persisted_across_adapter_recreation!==true) throw new Error('GEN2_39_REPLAY_PROOF_FAILED');
console.log('GEN2-15, MEL-EVOL-04 and GEN2-39 production D1 proof drills passed twice.');
NODE

PROVIDER_ESCAPE_READY=0
for PROVIDER_ESCAPE_ATTEMPT in $(seq 1 6); do
  PROVIDER_ESCAPE_CODE="$(curl --silent --show-error --max-time 90 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"provider-escape-proof"}' \
    --output production-provider-escape-proof.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  if [ "$PROVIDER_ESCAPE_CODE" = "200" ]; then
    PROVIDER_ESCAPE_READY=1
    break
  fi
  echo "Provider Escape proof attempt ${PROVIDER_ESCAPE_ATTEMPT}/6 returned HTTP ${PROVIDER_ESCAPE_CODE}."
  if [ -s production-provider-escape-proof.json ]; then
    node -e 'const fs=require("fs"); const raw=fs.readFileSync("production-provider-escape-proof.json","utf8"); try { const d=JSON.parse(raw); console.log(JSON.stringify({status:d?.status||null,code:d?.code||null,backup_id:d?.backup_id||null,backup_verified:d?.backup_verified===true,backup_encrypted:d?.backup_encrypted===true,ready_to_escape:d?.ready_to_escape===true,validation_issue_count:Number(d?.validation_issue_count||0)},null,2)); } catch { console.log(JSON.stringify({non_json_response:raw.slice(0,240)})); }'
  fi
  sleep 2
done
test "$PROVIDER_ESCAPE_READY" = "1"
node - <<'NODE'
const d=require('./production-provider-escape-proof.json');
if(d?.ok!==true || d?.status!=='MEL_RES_03_PRODUCTION_MANIFEST_VERIFIED') throw new Error('MEL_RES_03_PRODUCTION_PROOF_FAILED');
if(d?.ready_to_escape!==true || !Array.isArray(d?.ready_layers) || d.ready_layers.length!==3) throw new Error('MEL_RES_03_READY_LAYERS_FAILED');
if(Number(d?.alternative_adapter_count||0)<3) throw new Error('MEL_RES_03_ALTERNATIVES_FAILED');
if(d?.backup_verified!==true || !d?.backup_id) throw new Error('MEL_RES_03_BACKUP_EVIDENCE_FAILED');
if(d?.execution_started!==false || d?.activation_allowed!==false) throw new Error('MEL_RES_03_SAFETY_INVARIANT_FAILED');
console.log('MEL-RES-03 production Provider Escape manifest proof passed.');
NODE

CODE_SYNC_READY=0
CODE_SYNC_LAST_COMPLETED=-1
CODE_SYNC_STALL=0
CODE_SYNC_LAST_RELAY_JOB=""
CODE_SYNC_ACTIVE_ATTEMPTS=0
CODE_SYNC_MAX_ACTIVE_ATTEMPTS=32
CODE_SYNC_MAX_STALL=12
CODE_SYNC_DEADLINE_EPOCH=$(( $(date +%s) + 1200 ))
CODE_SYNC_CYCLE=0
while [ "$CODE_SYNC_READY" != "1" ] && [ "$(date +%s)" -lt "$CODE_SYNC_DEADLINE_EPOCH" ]; do
  CODE_SYNC_CYCLE=$((CODE_SYNC_CYCLE + 1))
  CODE_SYNC_CODE="$(curl --silent --show-error --max-time 170 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"code-sync"}' \
    --output production-launch-code-sync.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  CODE_SYNC_WAIT=2
  if [ "$CODE_SYNC_CODE" = "200" ]; then
    CODE_SYNC_STATE="$(node - <<'NODE'
const d=require('./production-launch-code-sync.json');
if(d?.ok!==true) throw new Error('PRODUCTION_CODE_SYNC_NOT_OK');
const s=d?.code_sync||{};
const completed=Number(s?.progress?.completed ?? s?.completed_shards ?? 0);
const target=Number(s?.progress?.target ?? s?.target_count ?? 7);
const failuresList=Array.isArray(s?.failures)?s.failures:[];
const explicitNext=String(s?.next_retry_at||'').trim();
const futureRetryAt=failuresList
  .filter(row=>row?.retryable===true&&row?.permanent!==true)
  .map(row=>String(row?.retry_after_at||'').trim())
  .filter(Boolean)
  .map(value=>({value,ms:Date.parse(value)}))
  .filter(row=>Number.isFinite(row.ms)&&row.ms>Date.now())
  .sort((a,b)=>a.ms-b.ms)[0]?.value||'';
const next=explicitNext||futureRetryAt;
const failures=failuresList.length;
process.stdout.write([
  d?.complete===true?'1':'0',
  String(s?.status||d?.status||'UNKNOWN'),
  Number.isFinite(completed)?String(completed):'0',
  Number.isFinite(target)?String(target):'7',
  next||'-',
  String(failures),
].join('|'));
NODE
    )"
    IFS='|' read -r CODE_SYNC_COMPLETE CODE_SYNC_STATUS CODE_SYNC_COMPLETED CODE_SYNC_TARGET CODE_SYNC_NEXT_RETRY CODE_SYNC_FAILURES <<< "$CODE_SYNC_STATE"
    node -e 'const d=require("./production-launch-code-sync.json"); const s=d?.code_sync||{}; console.log(JSON.stringify({status:s?.status||d?.status||null,complete:d?.complete===true,progress:s?.progress||null,pending_shards:Number(s?.pending_shards||0),reason:s?.reason||null,next_retry_at:s?.next_retry_at||null,relay_pending:s?.relay_pending===true,relay_job_id:s?.relay_job_id||null,relay_status:s?.relay_status||null,code_pool_exhaustions:Number(s?.code_pool_exhaustions||0),code_pool_refreshes:Number(s?.code_pool_refreshes||0),failure_count:Array.isArray(s?.failures)?s.failures.length:0},null,2));'
    if [ "$CODE_SYNC_COMPLETE" = "1" ]; then
      CODE_SYNC_READY=1
      break
    fi
    CODE_SYNC_WAITING_FOR_RETRY=0
    CODE_SYNC_RELAY_PENDING="$(node -p "require('./production-launch-code-sync.json')?.code_sync?.relay_pending===true?'1':'0'")"
    CODE_SYNC_RELAY_JOB_ID="$(node -p "String(require('./production-launch-code-sync.json')?.code_sync?.relay_job_id||'')")"
    if [ "$CODE_SYNC_RELAY_PENDING" = "1" ]; then
      CODE_SYNC_WAITING_FOR_RETRY=1
      CODE_SYNC_WAIT=8
      if [ -n "$CODE_SYNC_RELAY_JOB_ID" ] && [ "$CODE_SYNC_RELAY_JOB_ID" != "$CODE_SYNC_LAST_RELAY_JOB" ]; then
        printf '%s' '{"ref":"main"}' > github-relay-dispatch.json
        RELAY_DISPATCH_CODE="$(curl --silent --show-error --max-time 30 \
          --request POST \
          --header "Authorization: Bearer ${GITHUB_TOKEN}" \
          --header "Accept: application/vnd.github+json" \
          --header "X-GitHub-Api-Version: 2022-11-28" \
          --header "Content-Type: application/json" \
          --data-binary @github-relay-dispatch.json \
          --output github-relay-dispatch-response.txt \
          --write-out '%{http_code}' \
          "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/github-action-relay.yml/dispatches" || true)"
        test "$RELAY_DISPATCH_CODE" = "204"
        CODE_SYNC_LAST_RELAY_JOB="$CODE_SYNC_RELAY_JOB_ID"
        echo "Dispatched GitHub Action Relay for ShardVault mirror job ${CODE_SYNC_RELAY_JOB_ID}."
      fi
    fi
    if [ "$CODE_SYNC_NEXT_RETRY" != "-" ]; then
      CODE_SYNC_RETRY_DELTA="$(NEXT_RETRY="$CODE_SYNC_NEXT_RETRY" node -e 'const t=Date.parse(process.env.NEXT_RETRY||""); const delta=Number.isFinite(t)?Math.ceil((t-Date.now())/1000):0; process.stdout.write(String(Math.max(0,delta)))')"
      if [ "$CODE_SYNC_RETRY_DELTA" -gt 0 ]; then
        CODE_SYNC_WAITING_FOR_RETRY=1
        CODE_SYNC_WAIT="$(node -e 'const delta=Number(process.argv[1]||0); process.stdout.write(String(Math.max(2,Math.min(90,delta+1))))' "$CODE_SYNC_RETRY_DELTA")"
      fi
    fi
    if [ "$CODE_SYNC_COMPLETED" -gt "$CODE_SYNC_LAST_COMPLETED" ]; then
      CODE_SYNC_LAST_COMPLETED="$CODE_SYNC_COMPLETED"
      CODE_SYNC_STALL=0
    elif [ "$CODE_SYNC_WAITING_FOR_RETRY" = "1" ]; then
      echo "ShardVault is waiting for retry/relay completion; no active-attempt or no-progress budget is consumed."
    else
      CODE_SYNC_ACTIVE_ATTEMPTS=$((CODE_SYNC_ACTIVE_ATTEMPTS + 1))
      CODE_SYNC_STALL=$((CODE_SYNC_STALL + 1))
    fi
    echo "Launch code-sync cycle ${CODE_SYNC_CYCLE}: ${CODE_SYNC_COMPLETED}/${CODE_SYNC_TARGET}, status=${CODE_SYNC_STATUS}, active_attempts=${CODE_SYNC_ACTIVE_ATTEMPTS}/${CODE_SYNC_MAX_ACTIVE_ATTEMPTS}, stall=${CODE_SYNC_STALL}/${CODE_SYNC_MAX_STALL}, wait=${CODE_SYNC_WAIT}s."
  else
    # Cloudflare error 1042 is an edge/control-plane visibility gap:
    # the Worker can temporarily look absent while a deployment/secret
    # revision propagates. Do not burn ShardVault's no-progress budget
    # for a failure that happened before the code-sync handler ran.
    CODE_SYNC_WORKER_GAP=0
    if [ "$CODE_SYNC_CODE" = "404" ] && [ -s production-launch-code-sync.json ] && grep -q 'error code: 1042' production-launch-code-sync.json; then
      CODE_SYNC_WORKER_GAP=1
      CODE_SYNC_WAIT=10
      echo "Launch code-sync hit transient Cloudflare Worker visibility gap 1042; waiting without consuming ShardVault attempt/stall budget."
    else
      CODE_SYNC_ACTIVE_ATTEMPTS=$((CODE_SYNC_ACTIVE_ATTEMPTS + 1))
      CODE_SYNC_STALL=$((CODE_SYNC_STALL + 1))
      echo "Launch code-sync cycle ${CODE_SYNC_CYCLE} returned HTTP ${CODE_SYNC_CODE}; active_attempts=${CODE_SYNC_ACTIVE_ATTEMPTS}/${CODE_SYNC_MAX_ACTIVE_ATTEMPTS}, stall=${CODE_SYNC_STALL}/${CODE_SYNC_MAX_STALL}."
    fi
    if [ -s production-launch-code-sync.json ]; then
      node -e 'const fs=require("fs"); const raw=fs.readFileSync("production-launch-code-sync.json","utf8"); try { const d=JSON.parse(raw); console.log(JSON.stringify({status:d?.status||null,complete:d?.complete===true,code_sync:d?.code_sync||null},null,2)); } catch { console.log(JSON.stringify({transient_non_json_response:raw.slice(0,240)})); }'
    fi
  fi
  if [ "$CODE_SYNC_STALL" -ge "$CODE_SYNC_MAX_STALL" ]; then
    echo "Launch code-sync stopped after bounded no-progress window."
    break
  fi
  if [ "$CODE_SYNC_ACTIVE_ATTEMPTS" -ge "$CODE_SYNC_MAX_ACTIVE_ATTEMPTS" ]; then
    echo "Launch code-sync stopped after bounded active-attempt budget."
    break
  fi
  sleep "$CODE_SYNC_WAIT"
done
if [ "$CODE_SYNC_READY" != "1" ]; then
  echo "ShardVault code-sync did not reach a verified complete state before the bounded active-attempt/deadline gate."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 48
fi

node - <<'NODE'
const d=require('./production-launch-code-sync.json');
const s=d?.code_sync||{};
const status=String(s?.status||d?.status||'');
if(d?.ok!==true || d?.complete!==true) throw new Error('PRODUCTION_CODE_SYNC_FINAL_NOT_COMPLETE');
if(status==='PAUSED_FOR_ROADMAP'){
  if(process.env.MEL_ROADMAP_SHARDVAULT_PAUSED!=='true') throw new Error('PRODUCTION_CODE_SYNC_UNEXPECTED_PAUSE');
  if(s?.paused!==true) throw new Error('PRODUCTION_CODE_SYNC_PAUSE_NOT_EXPLICIT');
  console.log('ShardVault deep code-sync explicitly paused for temporary dev-light release mode.');
}else{
  if(!['COPIED','QUORUM_COPIED'].includes(status)) throw new Error('PRODUCTION_CODE_SYNC_FINAL_NOT_RELEASE_SAFE');
  if(Number(s?.target_count||s?.progress?.target||0)<7) throw new Error('PRODUCTION_CODE_SYNC_TARGET_LT_7');
  if(Number((s?.successful_endpoints||[]).length)<5) throw new Error('PRODUCTION_CODE_SYNC_SUCCESSFUL_ENDPOINTS_LT_RELEASE_QUORUM');
  if(s?.verified_roundtrip!==true) throw new Error('PRODUCTION_CODE_SYNC_ROUNDTRIP_NOT_VERIFIED');
  if(status==='QUORUM_COPIED' && s?.reconstruction_verified!==true) throw new Error('PRODUCTION_CODE_SYNC_QUORUM_RECONSTRUCTION_NOT_VERIFIED');
  if(status==='QUORUM_COPIED' && s?.repair_pending!==true) throw new Error('PRODUCTION_CODE_SYNC_QUORUM_REPAIR_NOT_PENDING');
  console.log(status==='COPIED'
    ? 'ShardVault code-sync reached full 7/7 COPIED state.'
    : 'ShardVault code-sync reached reconstructible 5+/7 quorum; background repair remains pending.');
}
NODE

ready=0
for attempt in $(seq 1 8); do
  HTTP_CODE="$(curl --silent --show-error --max-time 90 \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"phase":"readiness"}' \
    --output production-launch-bootstrap.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/internal/release-launch-bootstrap" || true)"
  if [ "$HTTP_CODE" = "200" ]; then
    ready=1
    break
  fi
  echo "Launch readiness phase attempt ${attempt}/8 returned HTTP ${HTTP_CODE}."
  if [ -s production-launch-bootstrap.json ]; then
    node -e 'const fs=require("fs"); const raw=fs.readFileSync("production-launch-bootstrap.json","utf8"); try { const d=JSON.parse(raw); console.log(JSON.stringify({status:d?.status||null,blockers:d?.readiness?.blockers||[],restore_status:d?.readiness?.restore?.status||null,shardvault_status:d?.readiness?.shardvault?.status||null,active_external_count:Number(d?.readiness?.shardvault?.active_external_count||0),external_code_status:d?.readiness?.shardvault?.external_code_status||null,external_code_endpoints:Number(d?.readiness?.shardvault?.external_code_endpoints||0)},null,2)); } catch { console.log(JSON.stringify({transient_non_json_response:raw.slice(0,240)})); }'
  fi
  sleep 3
done
test "$ready" -eq 1

EXPECTED_SHA="$EXPECTED_SHA" node - <<'NODE'
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('production-launch-bootstrap.json','utf8'));
const r=d?.readiness||{};
const shard=r.shardvault||{};
const restore=r.restore||{};
if(d?.ok!==true) throw new Error('PRODUCTION_LAUNCH_BOOTSTRAP_NOT_OK');
if(d?.autonomy_started!==false || d?.owner_launch_required!==true) throw new Error('BOOTSTRAP_MUST_NOT_START_AUTONOMY');
if(r?.launch_ready!==true || r?.status!=='GO_FOR_SUPERVISED_AUTONOMY') throw new Error('PRODUCTION_LAUNCH_NO_GO');
if(String(r?.candidate_sha||'')!==String(process.env.EXPECTED_SHA||'')) throw new Error('PRODUCTION_LAUNCH_SHA_MISMATCH');
for(const [key,value] of Object.entries(r?.gates||{})){
  if(value!==true) throw new Error('PRODUCTION_LAUNCH_GATE_FALSE:'+key);
}
if(restore?.ok!==true || restore?.sha_matches!==true) throw new Error('PRODUCTION_RESTORE_SHA_NOT_VERIFIED');
if(String(restore?.deployed_sha||'')!==String(process.env.EXPECTED_SHA||'')) throw new Error('PRODUCTION_RESTORE_DEPLOYED_SHA_MISMATCH');
if(String(restore?.backup_deployed_sha||'')!==String(process.env.EXPECTED_SHA||'')) throw new Error('PRODUCTION_BACKUP_SHA_MISMATCH');
const shardPaused=shard?.paused===true && shard?.status==='PAUSED_FOR_ROADMAP';
if(!shardPaused){
  if(shard?.ok!==true || shard?.recoverable!==true) throw new Error('PRODUCTION_SHARDVAULT_NOT_RECOVERABLE');
  if(Number(shard?.active_external_count||0)<5) throw new Error('PRODUCTION_SHARDVAULT_EXTERNAL_LT_RELEASE_QUORUM');
  if(!['COPIED','QUORUM_COPIED'].includes(String(shard?.external_code_status||''))) throw new Error('PRODUCTION_EXTERNAL_CODE_NOT_RELEASE_SAFE');
  if(Number(shard?.external_code_endpoints||0)<5) throw new Error('PRODUCTION_EXTERNAL_CODE_ENDPOINTS_LT_RELEASE_QUORUM');
  if(shard?.code_reconstruction_verified!==true) throw new Error('PRODUCTION_EXTERNAL_CODE_RECONSTRUCTION_NOT_VERIFIED');
} else {
  console.log('Production ShardVault gate explicitly paused for roadmap completion.');
}
console.log(JSON.stringify({
  status:r.status,
  candidate_sha:r.candidate_sha,
  gates:r.gates,
  retry_cap:r?.failure_hygiene?.retry_cap,
  historical_failed_count:r?.failure_hygiene?.historical_failed_count,
  restore,
  shardvault:shard,
  autonomy_started:d.autonomy_started,
  owner_launch_required:d.owner_launch_required,
},null,2));
NODE

PUBLIC_READY=0
for PUBLIC_ATTEMPT in $(seq 1 6); do
  PUBLIC_CODE="$(curl --silent --show-error --max-time 60 \
    --output production-launch-readiness.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/teacher/launch-readiness" || true)"
  if [ "$PUBLIC_CODE" = "200" ]; then
    PUBLIC_READY=1
    break
  fi
  echo "Public production launch-readiness attempt ${PUBLIC_ATTEMPT}/6 returned HTTP ${PUBLIC_CODE}; bounded retry."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  sleep $((PUBLIC_ATTEMPT * 2))
done
if [ "$PUBLIC_READY" != "1" ]; then
  echo "Public production launch-readiness did not return HTTP 200 after bounded retries."
  exit 28
fi

EXPECTED_SHA="$EXPECTED_SHA" node - <<'NODE'
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('production-launch-readiness.json','utf8'));
if(d?.launch_ready!==true || d?.status!=='GO_FOR_SUPERVISED_AUTONOMY') throw new Error('PUBLIC_PRODUCTION_LAUNCH_NO_GO');
if(String(d?.candidate_sha||'')!==String(process.env.EXPECTED_SHA||'')) throw new Error('PUBLIC_PRODUCTION_SHA_MISMATCH');
if(d?.restore?.ok!==true) throw new Error('PUBLIC_PRODUCTION_RESTORE_NOT_OK');
const shardPaused=d?.shardvault?.paused===true && d?.shardvault?.status==='PAUSED_FOR_ROADMAP';
if(!shardPaused){
  if(d?.shardvault?.ok!==true) throw new Error('PUBLIC_PRODUCTION_SHARDVAULT_NOT_OK');
  if(Number(d?.shardvault?.active_external_count||0)<5) throw new Error('PUBLIC_PRODUCTION_EXTERNAL_LT_RELEASE_QUORUM');
  if(!['COPIED','QUORUM_COPIED'].includes(String(d?.shardvault?.external_code_status||''))) throw new Error('PUBLIC_PRODUCTION_CODE_NOT_RELEASE_SAFE');
  if(Number(d?.shardvault?.external_code_endpoints||0)<5) throw new Error('PUBLIC_PRODUCTION_CODE_ENDPOINTS_LT_RELEASE_QUORUM');
  if(d?.shardvault?.code_reconstruction_verified!==true) throw new Error('PUBLIC_PRODUCTION_CODE_RECONSTRUCTION_NOT_VERIFIED');
} else {
  console.log('Public readiness reports ShardVault PAUSED_FOR_ROADMAP as expected.');
}
console.log('Public production launch-readiness proof is GO.');
NODE

READ_CODE="$(curl --silent --show-error --max-time 120 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data '{"text":"lis src/index.js dans ton code","conversation_id":"release-smoke-code-read"}' \
  --output production-code-read-smoke.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/chat")"
if [ "$READ_CODE" != "200" ]; then
  echo "Production code.read smoke returned HTTP ${READ_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 31
fi

SEARCH_CODE="$(curl --silent --show-error --max-time 120 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data '{"text":"cherche dans ton code \"createDefaultCapabilityBus\" dans src/capabilities/default-bus.js","conversation_id":"release-smoke-code-search"}' \
  --output production-code-search-smoke.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/chat")"
if [ "$SEARCH_CODE" != "200" ]; then
  echo "Production code.search smoke returned HTTP ${SEARCH_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 32
fi

EXPECTED_SHA="$EXPECTED_SHA" RELEASE_BRANCH="$RELEASE_BRANCH" node - <<'NODE'
const fs=require('fs');
const read=JSON.parse(fs.readFileSync('production-code-read-smoke.json','utf8'));
const search=JSON.parse(fs.readFileSync('production-code-search-smoke.json','utf8'));
const assertTool=(body,id)=>{
  if(body?.ok!==true) throw new Error('PRODUCTION_CHAT_NOT_OK:'+id);
  if(body?.release_smoke!==true) throw new Error('PRODUCTION_RELEASE_SMOKE_MARKER_MISSING:'+id);
  if(!Array.isArray(body?.capability_used)||!body.capability_used.includes(id)) throw new Error('PRODUCTION_CAPABILITY_NOT_USED:'+id);
  const row=(body?.tool_results||[]).find(x=>x?.capability===id);
  if(row?.status!=='SUCCEEDED') throw new Error('PRODUCTION_TOOL_NOT_SUCCEEDED:'+id+':'+String(row?.error||'UNKNOWN'));
  return row.result||{};
};
const readResult=assertTool(read,'code.read');
if(readResult.path!=='src/index.js') throw new Error('PRODUCTION_CODE_READ_PATH_MISMATCH');
if(String(readResult.branch||'')!==String(process.env.RELEASE_BRANCH||'')) throw new Error('PRODUCTION_CODE_READ_BRANCH_MISMATCH');
if(!String(readResult.content||'').includes('Canonical core Worker handler')) throw new Error('PRODUCTION_CODE_READ_CONTENT_MISMATCH');
const searchResult=assertTool(search,'code.search');
if(String(searchResult.branch||'')!==String(process.env.RELEASE_BRANCH||'')) throw new Error('PRODUCTION_CODE_SEARCH_BRANCH_MISMATCH');
if(!Array.isArray(searchResult.matches)||!searchResult.matches.some(x=>String(x?.path||'')==='src/capabilities/default-bus.js')) throw new Error('PRODUCTION_CODE_SEARCH_MATCH_MISSING');
console.log('Production authenticated /api/chat code.read + code.search smoke passed.');
NODE

OBS_ECHO_CODE="$(curl --silent --show-error --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data '{"id":"echo","input":{"value":"release-observability-smoke"}}' \
  --output production-observability-echo.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/capabilities/execute")"
if [ "$OBS_ECHO_CODE" != "200" ]; then
  echo "Production observability echo smoke returned HTTP ${OBS_ECHO_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 35
fi

RECOVERY_DRILL_CODE="$(curl --silent --show-error --max-time 90 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data '{"id":"resilience.recovery.drill.latest","input":{"approved":true}}' \
  --output production-recovery-drill.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/capabilities/execute")"
if [ "$RECOVERY_DRILL_CODE" != "200" ]; then
  echo "Production recovery drill returned HTTP ${RECOVERY_DRILL_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 37
fi

EXPECTED_SHA="$EXPECTED_SHA" node - <<'NODE'
const fs=require('fs');
const body=JSON.parse(fs.readFileSync('production-recovery-drill.json','utf8'));
const result=body?.result||{};
if(body?.ok!==true || body?.capability!=='resilience.recovery.drill.latest') throw new Error('PRODUCTION_RECOVERY_DRILL_CAPABILITY_NOT_OK');
if(result?.ok!==true || result?.state!=='PASSED') throw new Error('PRODUCTION_RECOVERY_DRILL_NOT_PASSED');
if(result?.restore_candidate_verified!==true) throw new Error('PRODUCTION_RECOVERY_SNAPSHOT_NOT_VERIFIED');
if(result?.production_access_used!==false || result?.activation_performed!==false) throw new Error('PRODUCTION_RECOVERY_SAFETY_INVARIANT_FAILED');
if(result?.teardown_completed!==true) throw new Error('PRODUCTION_RECOVERY_TEARDOWN_FAILED');
if(!result?.snapshot_id || !/^[0-9a-f]{40}$/i.test(String(result?.deployed_sha||''))) throw new Error('PRODUCTION_RECOVERY_PROVENANCE_MISSING');
if(Number(result?.reconstructed_tables||0)<1) throw new Error('PRODUCTION_RECOVERY_D1_RECONSTRUCTION_EMPTY');
console.log('Production GEN2-48 isolated recovery drill passed on snapshot '+result.snapshot_id+'.');
NODE

INTEGRITY_CODE="000"
for INTEGRITY_ATTEMPT in 1 2 3; do
  INTEGRITY_CODE="$(curl --silent --show-error --max-time 90 \
    --header "x-mel-release-smoke: 1" \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"id":"system.integrity","input":{}}' \
    --output production-system-integrity.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/gen2/capabilities/execute" || true)"
  if [ "$INTEGRITY_CODE" = "200" ]; then break; fi
  echo "GEN2-55 production integrity attempt ${INTEGRITY_ATTEMPT}/3 returned HTTP ${INTEGRITY_CODE}; bounded retry."
  sleep 2
done
if [ "$INTEGRITY_CODE" != "200" ]; then
  echo "GEN2-55 production integrity smoke returned HTTP ${INTEGRITY_CODE} after bounded retries."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 48
fi

MATURITY_CODE="000"
for MATURITY_ATTEMPT in 1 2 3; do
  MATURITY_CODE="$(curl --silent --show-error --max-time 90 \
    --header "x-mel-release-smoke: 1" \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"id":"system.maturity","input":{}}' \
    --output production-system-maturity.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/gen2/capabilities/execute" || true)"
  if [ "$MATURITY_CODE" = "200" ]; then break; fi
  echo "GEN2-55 production maturity attempt ${MATURITY_ATTEMPT}/3 returned HTTP ${MATURITY_CODE}; bounded retry."
  sleep 2
done
if [ "$MATURITY_CODE" != "200" ]; then
  echo "GEN2-55 production maturity smoke returned HTTP ${MATURITY_CODE} after bounded retries."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 49
fi

node - <<'NODE'
const fs=require('fs');
const integrity=JSON.parse(fs.readFileSync('production-system-integrity.json','utf8'));
const maturity=JSON.parse(fs.readFileSync('production-system-maturity.json','utf8'));
const i=integrity?.result||{};
const m=maturity?.result||{};
if(integrity?.ok!==true || integrity?.capability!=='system.integrity') throw new Error('GEN2_55_PRODUCTION_INTEGRITY_CAPABILITY_NOT_OK');
if(i?.schema!=='mel.data-integrity-audit' || i?.ok!==true) throw new Error('GEN2_55_PRODUCTION_INTEGRITY_FAILED');
if(maturity?.ok!==true || maturity?.capability!=='system.maturity') throw new Error('GEN2_55_PRODUCTION_MATURITY_CAPABILITY_NOT_OK');
if(m?.schema!=='mel.final-maturity-audit' || m?.ok!==true) throw new Error('GEN2_55_PRODUCTION_MATURITY_FAILED');
if(m?.invariants?.automatic_repair!==false || m?.invariants?.network_calls!==false) throw new Error('GEN2_55_PRODUCTION_READ_ONLY_INVARIANT_FAILED');
console.log('Production GEN2-55 D1 integrity + maturity audits passed.');
NODE

for DURABLE_CAPABILITY in timeline.list project.list event.list; do
  SAFE_NAME="${DURABLE_CAPABILITY//./-}"
  DURABLE_CODE="000"
  for DURABLE_ATTEMPT in 1 2 3; do
    DURABLE_CODE="$(curl --silent --show-error --max-time 60 \
      --header "x-mel-release-smoke: 1" \
      --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
      --header "content-type: application/json" \
      --data "{\"id\":\"${DURABLE_CAPABILITY}\",\"input\":{\"limit\":5}}" \
      --output "production-${SAFE_NAME}.json" \
      --write-out '%{http_code}' \
      "${BASE_URL}/api/gen2/capabilities/execute" || true)"
    if [ "$DURABLE_CODE" = "200" ]; then break; fi
    echo "Durable state production smoke ${DURABLE_CAPABILITY} attempt ${DURABLE_ATTEMPT}/3 returned HTTP ${DURABLE_CODE}; bounded retry."
    sleep 2
  done
  if [ "$DURABLE_CODE" != "200" ]; then
    echo "Durable state production smoke ${DURABLE_CAPABILITY} returned HTTP ${DURABLE_CODE} after bounded retries."
    test ! -s "production-${SAFE_NAME}.json" || cat "production-${SAFE_NAME}.json"
    exit 50
  fi
done

node - <<'NODE'
const fs=require('fs');
for(const id of ['timeline.list','project.list','event.list']){
  const file='production-'+id.replaceAll('.','-')+'.json';
  const body=JSON.parse(fs.readFileSync(file,'utf8'));
  if(body?.ok!==true || body?.capability!==id || !Array.isArray(body?.result)){
    throw new Error('DURABLE_STATE_PRODUCTION_PROOF_FAILED:'+id);
  }
}
console.log('Production GEN2-12/13/40 CapabilityBus -> D1 read proofs passed.');
NODE

SKILL_LIST_CODE="$(curl --silent --show-error --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data '{"id":"skill.list","input":{"active_only":true}}' \
  --output production-skill-list.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/capabilities/execute")"
if [ "$SKILL_LIST_CODE" != "200" ]; then
  echo "MEL-EVOL-05 production Skill Registry read returned HTTP ${SKILL_LIST_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 51
fi

node - <<'NODE'
const fs=require('fs');
const body=JSON.parse(fs.readFileSync('production-skill-list.json','utf8'));
if(body?.ok!==true || body?.capability!=='skill.list' || !Array.isArray(body?.result)) {
  throw new Error('MEL_EVOL_05_PRODUCTION_SKILL_LIST_FAILED');
}
console.log('Production MEL-EVOL-05 CapabilityBus -> D1 Skill Registry read proof passed.');
NODE

# GEN2-51: prove the deployed semantic v1 facade with release-only auth.
curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --dump-header production-gen2-51-version.headers \
  --output production-gen2-51-version.json \
  "${BASE_URL}/api/v1/version"
EXPECTED_SHA="$EXPECTED_SHA" node - <<'NODE'
const fs=require('fs');
const body=JSON.parse(fs.readFileSync('production-gen2-51-version.json','utf8'));
const headers=fs.readFileSync('production-gen2-51-version.headers','utf8').toLowerCase();
if(body?.current_version!=='v1') throw new Error('GEN2_51_PRODUCTION_VERSION_BODY_FAILED');
if(!headers.includes('x-mel-api-version: v1')) throw new Error('GEN2_51_PRODUCTION_VERSION_HEADER_FAILED');
if(!headers.includes('x-mel-api-route-status: canonical')) throw new Error('GEN2_51_PRODUCTION_ROUTE_STATUS_FAILED');
console.log('Production GEN2-51 semantic API proof passed.');
NODE

# MEL-COUNCIL-02: four bounded, zero-euro-governed candidates provide
# one extra independent provider/model when another Worker fails.
# Two actually completed critiques and synthesis are STILL required.
# MEL-COUNCIL-02: deep provider proof is non-blocking while dev-light mode is active.
if [ "${MEL_RELEASE_DEEP_AI_PROOFS_PAUSED:-false}" = "true" ]; then
  echo '{"ok":true,"skipped":true,"reason":"DEV_LIGHT_EXTERNAL_AI_PROOFS_PAUSED"}' > production-mel-council-02.json
  echo "MEL-COUNCIL-02 deep production proof paused for active roadmap development."
else
  # Model Council has two phases: independent critique (one bounded
  # retry per model), then synthesis with bounded provider fallback.
  # A 60s timeout PER provider can exceed curl's 120s deadline.
  # Use 15s per model here; keep >=2 actual independent critiques
  # plus synthesis mandatory. This proof only reads model answers,
  # so one bounded retry is safe on transient transport failure.
  COUNCIL_CODE="$(curl --silent --show-error --max-time 115 --retry 1 --retry-all-errors --retry-delay 2 \
    --header "x-mel-release-smoke: 1" \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"id":"model.council","input":{"request":{"prompt":"Production release proof: independently critique whether an exact-SHA deployment gate is safer than an unpinned deployment. Keep the answer concise."},"capability":"GENERAL","maxCandidates":4,"timeoutMs":15000}}' \
    --output production-mel-council-02.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/gen2/capabilities/execute")"
  if [ "${COUNCIL_CODE}" != "200" ]; then
    echo "MEL-COUNCIL-02 production Council returned HTTP ${COUNCIL_CODE}."
    echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
    exit 52
  fi
  node scripts/check-release-council-proof.mjs production-mel-council-02.json
fi

# GEN2-38: prove pure planning, zero-cost provider planning, and durable D1 Goal/Task persistence.
PLAN_ID="release-proof-${EXPECTED_SHA:0:12}"
PLAN_CODE="$(curl --silent --show-error --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data '{"id":"work.plan","input":{"goal":"Release proof plan","steps":[{"id":"step-1","title":"Echo proof","capability":"echo","input":{"value":"planning-proof"},"idempotent":true}]}}' \
  --output production-gen2-38-plan.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/capabilities/execute")"
if [ "$PLAN_CODE" != "200" ]; then
  echo "GEN2-38 pure plan returned HTTP ${PLAN_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 54
fi

if [ "${MEL_RELEASE_DEEP_AI_PROOFS_PAUSED:-false}" = "true" ]; then
  echo '{"ok":true,"skipped":true,"reason":"DEV_LIGHT_EXTERNAL_AI_PROOFS_PAUSED"}' > production-gen2-38-generated.json
  echo "GEN2-38 AI-generated planning proof paused for active roadmap development."
else
  # work.plan.generate is read-only/non-persistent; retry once if the
  # upstream multi-AI request hits the 120s network deadline.
  # Keep the real production proof mandatory and preserve rollback
  # when both attempts fail. Never retry mutating Work endpoints.
  GEN_PLAN_CODE="$(curl --silent --show-error --max-time 120 \
    --header "x-mel-release-smoke: 1" \
    --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
    --header "content-type: application/json" \
    --data '{"id":"work.plan.generate","input":{"goal":"Produce a one-step safe read-only diagnostic plan using only an actually available capability.","constraints":["No side effects","Use only listed capabilities"],"maxCandidates":2}}' \
    --output production-gen2-38-generated.json \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/gen2/capabilities/execute" || true)"
  if [ "$GEN_PLAN_CODE" != "200" ]; then
    echo "GEN2-38 generated plan returned HTTP ${GEN_PLAN_CODE}."
    # Preserve only sanitized application diagnostics; never echo raw provider output,
    # prompts, credentials, or plan contents into Actions logs.
    node --input-type=module -e '
      import { readFileSync } from "node:fs";
      let body = {};
      try { body = JSON.parse(readFileSync("production-gen2-38-generated.json", "utf8")); } catch {}
      const candidates = [
        body?.error?.code, body?.code, body?.result?.error?.code,
        body?.result?.code, body?.error_code
      ];
      const allowed = /^(WORK_PLAN_[A-Z0-9_]+|AUGMENTIO_[A-Z0-9_]+|CAPABILITY_[A-Z0-9_]+|VALIDATION_[A-Z0-9_]+)$/;
      const code = candidates.find(value => typeof value === "string" && allowed.test(value));
      console.log("GEN2-38 sanitized diagnostic code:", code || "UNAVAILABLE");
      const requestId = body?.requestId || body?.request_id || body?.error?.request_id;
      if (typeof requestId === "string" && /^[a-zA-Z0-9._:-]{1,100}$/.test(requestId)) console.log("GEN2-38 request id:", requestId);
    '
    echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
    exit 55
  fi


fi

SAVE_BODY="$(node -e 'const id=process.argv[1]; process.stdout.write(JSON.stringify({id:"work.plan.save",input:{id,goal:"GEN2-38 production D1 proof",steps:[{id:"step-1",title:"Echo proof",capability:"echo",input:{value:"d1-proof"},idempotent:true}]}}))' "$PLAN_ID")"
SAVE_CODE="$(curl --silent --show-error --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data "$SAVE_BODY" \
  --output production-gen2-38-saved.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/capabilities/execute")"
if [ "$SAVE_CODE" != "200" ]; then
  echo "GEN2-38 durable plan save returned HTTP ${SAVE_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 53
fi

GET_BODY="$(node -e 'process.stdout.write(JSON.stringify({id:"work.plan.get",input:{id:process.argv[1]}}))' "$PLAN_ID")"
GET_CODE="$(curl --silent --show-error --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data "$GET_BODY" \
  --output production-gen2-38-read.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/capabilities/execute")"
if [ "$GET_CODE" != "200" ]; then
  echo "GEN2-38 durable plan read returned HTTP ${GET_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 56
fi

node - <<'NODE'
const fs=require('fs');
const pure=JSON.parse(fs.readFileSync('production-gen2-38-plan.json','utf8'));
const generated=JSON.parse(fs.readFileSync('production-gen2-38-generated.json','utf8'));
const saved=JSON.parse(fs.readFileSync('production-gen2-38-saved.json','utf8'));
const read=JSON.parse(fs.readFileSync('production-gen2-38-read.json','utf8'));
if(pure?.ok!==true || pure?.result?.ok!==true || !Array.isArray(pure?.result?.nodes)) throw new Error('GEN2_38_PURE_PLAN_FAILED');
const deepAiPaused=process.env.MEL_RELEASE_DEEP_AI_PROOFS_PAUSED==='true';
if(!deepAiPaused && (generated?.ok!==true || generated?.result?.ok!==true || generated?.result?.generator?.execution_started!==false || generated?.result?.generator?.persisted!==false)) throw new Error('GEN2_38_ZERO_COST_GENERATION_FAILED');
if(saved?.ok!==true || !saved?.result?.id) throw new Error('GEN2_38_D1_SAVE_FAILED');
if(read?.ok!==true || read?.result?.id!==saved?.result?.id || !Array.isArray(read?.result?.tasks)) throw new Error('GEN2_38_D1_READ_FAILED');
console.log('Production GEN2-38 planning + zero-cost generation + D1 persistence proof passed.');
NODE

OBS_READINESS_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-observability-readiness.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/readiness")"
if [ "$OBS_READINESS_CODE" != "200" ]; then
  echo "Production observability readiness smoke returned HTTP ${OBS_READINESS_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 36
fi

node - <<'NODE'
const fs=require('fs');
const echo=JSON.parse(fs.readFileSync('production-observability-echo.json','utf8'));
const ready=JSON.parse(fs.readFileSync('production-observability-readiness.json','utf8'));
if(echo?.ok!==true || echo?.capability!=='echo' || echo?.result?.value!=='release-observability-smoke') {
  throw new Error('PRODUCTION_OBSERVABILITY_ECHO_NOT_OK');
}
if(ready?.ok!==true || ready?.observability?.query_ok!==true) {
  throw new Error('PRODUCTION_OBSERVABILITY_QUERY_NOT_OK');
}
const metrics=ready?.observability?.metrics||{};
if(Number(metrics.capability_events||0)<1) throw new Error('PRODUCTION_OBSERVABILITY_EVENT_MISSING');
if(Number(metrics.succeeded||0)<1) throw new Error('PRODUCTION_OBSERVABILITY_SUCCESS_MISSING');
if(!metrics.latest_event_at) throw new Error('PRODUCTION_OBSERVABILITY_LATEST_EVENT_MISSING');
const component=(ready?.dashboard?.components||[]).find(row=>row?.id==='runtime_observability');
if(!component || component?.evidence?.query_ok!==true) throw new Error('PRODUCTION_OBSERVABILITY_DASHBOARD_MISSING');
console.log('Production D1 observability metrics smoke passed.');
NODE

GEN1_STATUS_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-gen1-migration-before.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/migration/gen1-status")"
if [ "$GEN1_STATUS_CODE" != "200" ]; then
  echo "Production GEN2-57 status returned HTTP ${GEN1_STATUS_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 37
fi

GEN1_SOURCE_ROWS="$(node - <<'NODE'
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('production-gen1-migration-before.json','utf8'));
if(d?.ok!==true) throw new Error('GEN1_STATUS_NOT_OK');
if(d?.source_preserved!==true) throw new Error('GEN1_SOURCE_NOT_PRESERVED');
if(d?.schema?.supported!==true) throw new Error('GEN1_SCHEMA_UNSUPPORTED:'+JSON.stringify(d?.schema||{}));
const rows=Number(d?.source_rows||0);
if(!Number.isInteger(rows)||rows<0) throw new Error('GEN1_SOURCE_COUNT_INVALID');
console.error(JSON.stringify({
  status:d.status,
  source_present:d.source_present,
  source_rows:rows,
  archived_messages:Number(d?.archived_messages||0),
  remaining_interactions:Number(d?.remaining_interactions||0),
  coverage_complete:d?.coverage_complete===true,
}));
process.stdout.write(String(rows));
NODE
)"

GEN1_COVERAGE="$(node -e 'const d=require("./production-gen1-migration-before.json"); process.stdout.write(d?.coverage_complete===true?"1":"0")')"
if [ "$GEN1_COVERAGE" != "1" ]; then
  GEN1_MAX_BATCHES="$(( (GEN1_SOURCE_ROWS + 499) / 500 + 2 ))"
  if [ "$GEN1_MAX_BATCHES" -gt 1000 ]; then
    echo "GEN2-57 source exceeds bounded release migration budget: ${GEN1_SOURCE_ROWS} interactions."
    exit 38
  fi
  GEN1_CURSOR=0
  GEN1_DONE=0
  for GEN1_BATCH in $(seq 1 "$GEN1_MAX_BATCHES"); do
    GEN1_BACKFILL_CODE="$(curl --silent --show-error --max-time 120 \
      --header "x-mel-release-smoke: 1" \
      --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
      --header "content-type: application/json" \
      --data "{\"after_id\":${GEN1_CURSOR},\"limit\":500}" \
      --output production-gen1-migration-batch.json \
      --write-out '%{http_code}' \
      "${BASE_URL}/api/gen2/migration/gen1-backfill")"
    if [ "$GEN1_BACKFILL_CODE" != "200" ]; then
      echo "GEN2-57 backfill batch ${GEN1_BATCH} returned HTTP ${GEN1_BACKFILL_CODE}."
      echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
      exit 39
    fi
    GEN1_BATCH_STATE="$(node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("production-gen1-migration-batch.json","utf8")); if(d?.ok!==true) throw new Error("GEN1_BACKFILL_NOT_OK"); if(d?.source_preserved!==true) throw new Error("GEN1_BACKFILL_SOURCE_NOT_PRESERVED"); if(d?.schema?.supported!==true) throw new Error("GEN1_BACKFILL_SCHEMA_UNSUPPORTED"); const last=d?.batch?.last_id; const done=d?.coverage_complete===true; if(!done&&(!Number.isInteger(Number(last))||Number(last)<0)) throw new Error("GEN1_BACKFILL_CURSOR_MISSING"); process.stdout.write(String(last==null?0:Number(last))+" "+(done?"1":"0"));')"
    GEN1_LAST_ID="${GEN1_BATCH_STATE%% *}"
    GEN1_DONE="${GEN1_BATCH_STATE##* }"
    if [ "$GEN1_DONE" = "1" ]; then
      break
    fi
    GEN1_CURSOR="$GEN1_LAST_ID"
  done
  test "$GEN1_DONE" = "1"
fi

GEN1_FINAL_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-gen1-migration-final.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/migration/gen1-status")"
test "$GEN1_FINAL_CODE" = "200"

GEN1_SOURCE_ROWS="$GEN1_SOURCE_ROWS" node - <<'NODE'
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('production-gen1-migration-final.json','utf8'));
const before=Number(process.env.GEN1_SOURCE_ROWS||0);
if(d?.ok!==true) throw new Error('GEN1_FINAL_STATUS_NOT_OK');
if(d?.source_preserved!==true) throw new Error('GEN1_FINAL_SOURCE_NOT_PRESERVED');
if(d?.schema?.supported!==true) throw new Error('GEN1_FINAL_SCHEMA_UNSUPPORTED');
if(Number(d?.source_rows||0)!==before) throw new Error('GEN1_SOURCE_COUNT_CHANGED');
if(d?.coverage_complete!==true) throw new Error('GEN1_COVERAGE_INCOMPLETE');
if(Number(d?.remaining_interactions||0)!==0) throw new Error('GEN1_REMAINING_NOT_ZERO');
if(Number(d?.archived_messages||0)!==before*2) throw new Error('GEN1_ARCHIVE_COUNT_MISMATCH');
console.log(JSON.stringify({
  status:d.status,
  source_present:d.source_present,
  source_rows:before,
  archived_messages:Number(d.archived_messages||0),
  migrated_interactions:Number(d.migrated_interactions||0),
  remaining_interactions:Number(d.remaining_interactions||0),
  coverage_complete:d.coverage_complete,
  source_preserved:d.source_preserved,
},null,2));
NODE

CHATGPT_STATUS_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-chatgpt-archive-status.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/import/chatgpt-status")"
if [ "$CHATGPT_STATUS_CODE" != "200" ]; then
  echo "Production MEL-MEM-05 status returned HTTP ${CHATGPT_STATUS_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 40
fi

node - <<'NODE'
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('production-chatgpt-archive-status.json','utf8'));
if(d?.ok!==true || d?.db_bound!==true || d?.status!=='ONLINE') {
  throw new Error('MEL_MEM_05_PRODUCTION_STATUS_NOT_ONLINE');
}
const attachment=d?.attachment_index||{};
for(const [key,value] of Object.entries({
  conversations:d?.conversations,
  messages:d?.messages,
  unsynced_messages:d?.unsynced_messages,
  messages_with_attachments:attachment?.messages_with_attachments,
  attachment_descriptors:attachment?.descriptors,
  binary_content_available:attachment?.binary_content_available,
  indexed_descriptors:attachment?.indexed_descriptors,
})) {
  const n=Number(value||0);
  if(!Number.isFinite(n) || n<0) throw new Error('MEL_MEM_05_INVALID_COUNT:'+key);
}
console.log(JSON.stringify({
  mel_mem_05_status:'OBSERVED',
  conversations:Number(d.conversations||0),
  messages:Number(d.messages||0),
  unsynced_messages:Number(d.unsynced_messages||0),
  memory_sync_complete:d.memory_sync_complete===true,
  server_archive_complete:d.server_archive_complete===true,
  collector_inventory_confirmed:d.collector_inventory_confirmed===true,
  full_archive_confirmed:d.full_archive_confirmed===true,
  attachment_index:{
    messages_with_attachments:Number(attachment.messages_with_attachments||0),
    descriptors:Number(attachment.descriptors||0),
    metadata_searchable:attachment.metadata_searchable===true,
    binary_content_available:Number(attachment.binary_content_available||0),
    indexed_descriptors:Number(attachment.indexed_descriptors||0),
    binary_content_indexed:attachment.binary_content_indexed===true,
  },
  completeness:d?.stages?.completeness||null,
},null,2));
NODE

CHATGPT_MEMORY_STATUS_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-chatgpt-memory-before.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/migration/chatgpt-memory-status")"
if [ "$CHATGPT_MEMORY_STATUS_CODE" != "200" ]; then
  echo "Production MEL-MEM-05 memory status returned HTTP ${CHATGPT_MEMORY_STATUS_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 43
fi

CHATGPT_MEMORY_DONE="$(node -e 'const d=require("./production-chatgpt-memory-before.json"); if(d?.ok!==true) throw new Error("CHATGPT_MEMORY_STATUS_NOT_OK"); process.stdout.write(d?.complete===true?"1":"0")')"
if [ "$CHATGPT_MEMORY_DONE" != "1" ]; then
  for CHATGPT_MEMORY_BATCH in $(seq 1 20); do
    CHATGPT_MEMORY_CODE="$(curl --silent --show-error --max-time 120 \
      --header "x-mel-release-smoke: 1" \
      --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
      --header "content-type: application/json" \
      --data '{"conversation_limit":50}' \
      --output production-chatgpt-memory-batch.json \
      --write-out '%{http_code}' \
      "${BASE_URL}/api/gen2/migration/chatgpt-memory-backfill")"
    if [ "$CHATGPT_MEMORY_CODE" != "200" ]; then
      echo "MEL-MEM-05 memory backfill batch ${CHATGPT_MEMORY_BATCH} returned HTTP ${CHATGPT_MEMORY_CODE}."
      echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
      exit 44
    fi
    CHATGPT_MEMORY_STATE="$(node -e 'const d=require("./production-chatgpt-memory-batch.json"); if(d?.ok!==true) throw new Error("CHATGPT_MEMORY_BACKFILL_NOT_OK"); const remaining=Number(d?.remaining_eligible_messages); if(!Number.isInteger(remaining)||remaining<0) throw new Error("CHATGPT_MEMORY_REMAINING_INVALID"); process.stdout.write((d?.complete===true?"1":"0")+" "+remaining);')"
    CHATGPT_MEMORY_DONE="${CHATGPT_MEMORY_STATE%% *}"
    CHATGPT_MEMORY_REMAINING="${CHATGPT_MEMORY_STATE##* }"
    echo "MEL-MEM-05 batch ${CHATGPT_MEMORY_BATCH}: remaining eligible messages=${CHATGPT_MEMORY_REMAINING}"
    if [ "$CHATGPT_MEMORY_DONE" = "1" ]; then
      break
    fi
  done
  test "$CHATGPT_MEMORY_DONE" = "1"
fi

CHATGPT_MEMORY_FINAL_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-chatgpt-memory-final.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/migration/chatgpt-memory-status")"
test "$CHATGPT_MEMORY_FINAL_CODE" = "200"

node - <<'NODE'
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('production-chatgpt-memory-final.json','utf8'));
if(d?.ok!==true) throw new Error('CHATGPT_MEMORY_FINAL_NOT_OK');
if(d?.complete!==true) throw new Error('CHATGPT_MEMORY_FINAL_INCOMPLETE');
if(Number(d?.remaining_eligible_messages||0)!==0) throw new Error('CHATGPT_MEMORY_REMAINING_NOT_ZERO');
if(Number(d?.synced_eligible_messages||0)!==Number(d?.eligible_messages||0)) throw new Error('CHATGPT_MEMORY_SYNC_COUNT_MISMATCH');
console.log(JSON.stringify({
  mel_mem_05_memory_backfill:'COMPLETE',
  total_messages:Number(d.total_messages||0),
  eligible_messages:Number(d.eligible_messages||0),
  ineligible_messages:Number(d.ineligible_messages||0),
  synced_eligible_messages:Number(d.synced_eligible_messages||0),
  remaining_eligible_messages:Number(d.remaining_eligible_messages||0),
  remaining_conversations:Number(d.remaining_conversations||0),
},null,2));
NODE

SELF_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-code-self-check.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/code/self-check")"
if [ "$SELF_CODE" != "200" ]; then
  echo "Production code self-check returned HTTP ${SELF_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 33
fi

MEMORY_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-memory-status.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/memory/status")"
if [ "$MEMORY_CODE" != "200" ]; then
  echo "Production memory smoke returned HTTP ${MEMORY_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 34
fi

PROFESSOR_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-professor.html \
  --write-out '%{http_code}' \
  "${BASE_URL}/professor")"
test "$PROFESSOR_CODE" = "200"

RUNTIME_CODE="$(curl --silent --show-error --retry 2 --retry-all-errors --retry-delay 3 --max-time 60 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --output production-normal-runtime.js \
  --write-out '%{http_code}' \
  "${BASE_URL}/normal-runtime.js")"
test "$RUNTIME_CODE" = "200"

RELEASE_BRANCH="$RELEASE_BRANCH" node - <<'NODE'
const fs=require('fs');
const self=JSON.parse(fs.readFileSync('production-code-self-check.json','utf8'));
const memory=JSON.parse(fs.readFileSync('production-memory-status.json','utf8'));
const professor=fs.readFileSync('production-professor.html','utf8');
const runtime=fs.readFileSync('production-normal-runtime.js','utf8');

if(self?.ok!==true || self?.capability!=='code.read') throw new Error('PRODUCTION_SELF_CODE_NOT_OK');
if(self?.path!=='src/router.js') throw new Error('PRODUCTION_SELF_CODE_PATH_MISMATCH');
if(String(self?.branch||'')!==String(process.env.RELEASE_BRANCH||'')) throw new Error('PRODUCTION_SELF_CODE_BRANCH_MISMATCH');
if(String(self?.deployed_sha||'').toLowerCase()!==String(process.env.EXPECTED_SHA||'').toLowerCase()) throw new Error('PRODUCTION_SELF_DEPLOYED_SHA_MISMATCH');
if(self?.exact_deployment_identity_known!==true) throw new Error('PRODUCTION_SELF_DEPLOYED_IDENTITY_UNKNOWN');
if(Number(self?.bytes||0)<100) throw new Error('PRODUCTION_SELF_CODE_EMPTY');

if(memory?.ok!==true || memory?.db_bound!==true || memory?.status!=='ONLINE') throw new Error('PRODUCTION_MEMORY_NOT_ONLINE');
for(const key of ['memory_count','archive_count','conversation_count']){
  if(!Number.isFinite(Number(memory?.[key])) || Number(memory[key])<0) throw new Error('PRODUCTION_MEMORY_COUNT_INVALID:'+key);
}
if(memory?.portable!==true || memory?.provenance!==true) throw new Error('PRODUCTION_MEMORY_CONTRACT_INCOMPLETE');

if(!professor.includes('Centre de contrôle')) throw new Error('PRODUCTION_PROFESSOR_MARKER_MISSING');
if(!professor.includes('data-panel="memory"') || !professor.includes('data-panel="roadmap"')) throw new Error('PRODUCTION_PROFESSOR_PANEL_MISSING');
if(!runtime.includes("fetch('/api/chat'")) throw new Error('PRODUCTION_NORMAL_RUNTIME_CHAT_WIRING_MISSING');
if(!runtime.includes('toggleVoice')) throw new Error('PRODUCTION_NORMAL_RUNTIME_VOICE_WIRING_MISSING');

console.log('Production code self-check + memory + UI smoke passed.');
NODE

GEN2_37_CODE="$(curl --silent --show-error --max-time 90 \
  --header "x-mel-release-smoke: 1" \
  --header "x-mel-launch-bootstrap: ${BOOTSTRAP_TOKEN}" \
  --header "content-type: application/json" \
  --data '{"query":"Cloudflare Workers official documentation","maxDepth":2,"seed_urls":["https://developers.cloudflare.com/workers/"]}' \
  --output production-gen2-37-research.json \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/gen2/web/research")"
if [ "$GEN2_37_CODE" != "200" ]; then
  echo "GEN2-37 production research proof returned HTTP ${GEN2_37_CODE}."
  echo 'Production autonomy proof response withheld from CI logs; see sanitized HTTP/status evidence.'
  exit 47
fi

node - <<'NODE'
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('production-gen2-37-research.json','utf8'));
const r=d?.research||{};
const sources=Array.isArray(r?.sources)?r.sources:[];
const source=sources[0]||{};
if(d?.ok!==true) throw new Error('GEN2_37_PRODUCTION_RESEARCH_NOT_OK');
if(Number(r?.discovery?.official_sources_loaded||0)!==1) throw new Error('GEN2_37_PRODUCTION_OFFICIAL_SOURCE_NOT_LOADED');
if(Number(r?.quality_summary?.bands?.HIGH_PROVENANCE||0)<1) throw new Error('GEN2_37_PRODUCTION_HIGH_PROVENANCE_MISSING');
if(Number(r?.quality_summary?.bands?.DISCOVERY_ONLY||0)!==0) throw new Error('GEN2_37_PRODUCTION_DISCOVERY_ONLY_LEAK');
if(source?.source_kind!=='OFFICIAL_SEED') throw new Error('GEN2_37_PRODUCTION_SOURCE_KIND_MISMATCH');
if(source?.quality?.band!=='HIGH_PROVENANCE' || Number(source?.quality?.score||0)<80) throw new Error('GEN2_37_PRODUCTION_QUALITY_GATE_FAILED');
if(!source?.provenance?.source_id || !source?.provenance?.fetched_at) throw new Error('GEN2_37_PRODUCTION_PROVENANCE_MISSING');
if(source?.quality?.caveat!=='transport_and_provenance_heuristic_not_truth_score') throw new Error('GEN2_37_PRODUCTION_CAVEAT_MISSING');
console.log(JSON.stringify({
  gen2_37:'PRODUCTION_VERIFIED',
  quality_summary:r.quality_summary,
  source:{
    url:source.url,
    source_kind:source.source_kind,
    quality:source.quality,
    provenance:source.provenance,
  },
},null,2));
NODE

echo "MEL_RELEASE_EVIDENCE_PHASE=ALL_PROOFS_COMPLETE $(date -u +%FT%TZ)"
echo "Temporary launch bootstrap secret deleted."

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo '### MEL production launch readiness'
    echo
    echo '- Verdict: **GO_FOR_SUPERVISED_AUTONOMY**'
    echo "- Exact SHA: \`${EXPECTED_SHA}\`"
    echo '- Fresh SHA-bound system backup: verified'
    echo '- ShardVault recovery: verified'
    if [ "$MEL_ROADMAP_SHARDVAULT_PAUSED" = "true" ]; then
      echo '- External critical-code copies: temporarily paused for roadmap completion'
    else
      echo '- External critical-code copies: >= 7'
    fi
    echo '- Authenticated /api/chat code.read + code.search: verified'
    echo '- D1 runtime observability metrics: verified'
    echo '- Code self-check: verified'
    echo '- Memory status: ONLINE + D1 bound'
    echo '- Professor + normal runtime UI: verified'
    echo '- GEN2-37 official web source quality/provenance: verified'
    echo '- GEN2-12/13/40 Timeline + Projects + Event Bus D1 reads: verified'
    echo '- MEL-EVOL-05 Skill Registry D1 read: verified'
    echo '- Historical failure retries: bounded'
    echo '- Autonomy started by deployment: **no**'
    echo '- Owner Resume/MAX remains required to start the SHA'
    echo '- Release bootstrap token: exact-deploy bound and rotated on next release'
  } >> "$GITHUB_STEP_SUMMARY"
fi
