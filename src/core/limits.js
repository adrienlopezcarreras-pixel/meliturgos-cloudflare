export const LEGACY_CHAT_INPUT_CHARS = 12_000;
export const MAX_CHAT_INPUT_CHARS = 100_000;
export const MAX_CHAT_REQUEST_BYTES = 600_000;

export const CHAT_LIMITS = Object.freeze({
  legacy_input_chars: LEGACY_CHAT_INPUT_CHARS,
  max_input_chars: MAX_CHAT_INPUT_CHARS,
  max_request_bytes: MAX_CHAT_REQUEST_BYTES,
});
