// MELITURGOS Gen2 — Core configuration
export const APP_VERSION = "0.2.5-rc.2-gen2.1";
export const APP_NAME = "MELITURGOS";

export const DEFAULTS = {
  maxInteractionsInPrompt: 24,
  maxMemoryResults: 12,
  syncWindowMs: 30 * 24 * 60 * 60 * 1000,
};

export const ALLOWED_MODELS = [
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/meta/llama-3.1-70b-instruct",
  "@cf/mistral/mistral-7b-instruct-v0.2",
  "@cf/openai/whisper-large-v3-turbo",
];

export const DEFAULT_CONVERSATION_MODEL = "@cf/moonshotai/kimi-k2.7-code";

export const DB_SCHEMA_VERSION = 6;
