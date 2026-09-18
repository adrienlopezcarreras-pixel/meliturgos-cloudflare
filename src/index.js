// Canonical core Worker handler. worker.js is a logic-free compatibility alias;
// deployment/auth/UI wrappers delegate here without owning a second runtime.
import router from "./router.js";
import { requireAuth } from "./core/security.js";
import { setDefaultCapabilityEnvironment } from "./capabilities/default-bus.js";
import { createGen2Runtime } from "./core/orchestrator/gen2-runtime.js";
import { injectEvolutionPreflightCapability } from "./evolution/chat-intent.js";
import { getSystemReadiness } from "./diagnostics/system-readiness.js";
import { handleNativeChat } from "./api/native-chat.js";
import { maybeHandlePublicTeacherBridge } from "./teachers/public-teacher-api.js";
import { runAutonomyRuntimeTick } from "./evolution/autonomy-runtime.js";
import { runEcosystemCapabilityWatch } from "./evaluation/capability-watch-runtime.js";
import { maybeHandleAutonomyApi } from "./evolution/autonomy-api.js";
import { serveMelAvatar } from "./pages/mel-avatar-assets.js";
import { enhanceThemeAvatars } from "./pages/theme-avatar-enhancer.js";
import { enhanceMvpBehavior } from "./pages/mvp-behavior-enhancer.js";
import { runLoraTrainingHeartbeat } from "./learning/lora-training-heartbeat.js";

let lastSafeWorkJob = null;

function deployedWatchSourceSha() {
  return typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '') || null : null;
}

function isArchivePayload(value) {
  if (Array.isArray(value)) return value.some(x => x && (x.mapping || x.messages || x.conversation_id || x.id));
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.conversations) || Array.isArray(value.items)) return true;
  return Boolean(value.mapping || value.messages);
}
