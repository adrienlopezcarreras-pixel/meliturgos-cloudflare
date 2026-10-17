// Single wall-clock budget for one /api/chat request.
//
// The browser aborts /api/chat after CLIENT_CHAT_TIMEOUT_MS (see
// requestTimeoutMs() in src/pages/full-interface-v2.js). Before this module the
// server gave every model attempt its own 120 s timeout, chained up to three
// router candidates, four untimed fallback calls, a Council recovery and a
// continuation. The server could therefore keep working for minutes after the
// browser had already shown "Réponse serveur trop lente". Every server step now
// draws from one budget that always ends before the client gives up, so the
// owner gets an explicit error code instead of a silent abort.

export const CLIENT_CHAT_TIMEOUT_MS = 120_000;
export const DEFAULT_CHAT_SERVER_BUDGET_MS = 90_000;
// Leave room for response serialisation and network latency to the browser.
export const MAX_CHAT_SERVER_BUDGET_MS = CLIENT_CHAT_TIMEOUT_MS - 15_000;
export const MIN_CHAT_SERVER_BUDGET_MS = 10_000;

// Optional steps only start when enough budget remains to finish them.
export const COUNCIL_RECOVERY_MIN_REMAINING_MS = 30_000;
export const CONTINUATION_MIN_REMAINING_MS = 15_000;
export const FALLBACK_ATTEMPT_MIN_REMAINING_MS = 5_000;

export function chatServerBudgetMs(env = {}) {
  const configured = Number(env?.MEL_CHAT_SERVER_BUDGET_MS);
  const value = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CHAT_SERVER_BUDGET_MS;
  return Math.max(MIN_CHAT_SERVER_BUDGET_MS, Math.min(MAX_CHAT_SERVER_BUDGET_MS, Math.round(value)));
}

export function createChatDeadline(env = {}, now = Date.now()) {
  return now + chatServerBudgetMs(env);
}

export function chatRemainingMs(deadlineAt, now = Date.now()) {
  if (deadlineAt == null || deadlineAt === '' || !Number.isFinite(Number(deadlineAt))) return Infinity;
  return Math.max(0, Number(deadlineAt) - now);
}

export function hasChatBudget(deadlineAt, minRemainingMs, now = Date.now()) {
  return chatRemainingMs(deadlineAt, now) >= minRemainingMs;
}

export function chatDeadlineError() {
  const error = new Error('CHAT_DEADLINE_EXCEEDED');
  error.code = 'CHAT_DEADLINE_EXCEEDED';
  error.status = 504;
  return error;
}

// Races a promise against the remaining budget. The underlying call is not
// cancelled (Workers AI exposes no abort), but the request stops waiting for it.
export function raceChatDeadline(promise, deadlineAt, now = Date.now()) {
  const remaining = chatRemainingMs(deadlineAt, now);
  if (remaining === Infinity) return promise;
  if (remaining <= 0) return Promise.reject(chatDeadlineError());
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(chatDeadlineError()), remaining); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}
