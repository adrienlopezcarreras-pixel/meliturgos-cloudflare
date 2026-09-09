export class ChatMessageQueue {
  constructor({
    processMessage,
    onStateChange = () => {},
    onMessageStart = () => {},
    onMessageEnd = () => {},
    onMessageError = () => {},
  } = {}) {
    if (typeof processMessage !== "function") {
      throw new TypeError("processMessage must be a function");
    }

    this.processMessage = processMessage;
    this.onStateChange = onStateChange;
    this.onMessageStart = onMessageStart;
    this.onMessageEnd = onMessageEnd;
    this.onMessageError = onMessageError;

    this.queue = [];
    this.processing = false;
    this.active = null;
    this.sequence = 0;
    this.seenIds = new Set();
  }

  getState() {
    return {
      status: this.processing ? "generating" : "idle",
      queued: this.queue.length,
      activeId: this.active?.id ?? null,
    };
  }

  emitState() {
    this.onStateChange(this.getState());
  }

  enqueue(text, metadata = {}) {
    const normalized = typeof text === "string" ? text.trim() : "";
    if (!normalized) return null;

    const id = metadata.id || `msg-${Date.now()}-${++this.sequence}`;
    if (this.seenIds.has(id)) return id;

    const item = {
      id,
      text: normalized,
      metadata: { ...metadata, id },
      enqueuedAt: new Date().toISOString(),
    };

    this.seenIds.add(id);
    this.queue.push(item);
    this.emitState();
    void this.#drain();
    return id;
  }

  async #drain() {
    if (this.processing) return;
    this.processing = true;
    this.emitState();

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        const controller = new AbortController();
        this.active = { ...item, controller };
        this.emitState();
        this.onMessageStart(item, this.getState());

        try {
          const result = await this.processMessage(item, {
            signal: controller.signal,
            state: () => this.getState(),
          });
          this.onMessageEnd(item, result, this.getState());
        } catch (error) {
          const aborted = controller.signal.aborted || error?.name === "AbortError";
          this.onMessageError(item, error, { aborted, ...this.getState() });
        } finally {
          this.active = null;
          this.emitState();
        }
      }
    } finally {
      this.processing = false;
      this.active = null;
      this.emitState();
    }
  }

  stopCurrent(reason = "user_stop") {
    if (!this.active?.controller) return false;
    if (this.active.controller.signal.aborted) return false;
    this.active.controller.abort(reason);
    return true;
  }

  clearQueued() {
    const removed = this.queue.splice(0);
    this.emitState();
    return removed;
  }
}

export function handleComposerKeydown(event, { send, getText }) {
  if (!event || typeof send !== "function" || typeof getText !== "function") {
    throw new TypeError("event, send and getText are required");
  }

  if (event.key !== "Enter") return false;
  if (event.shiftKey) return false;
  if (event.isComposing) return false;

  const text = String(getText() ?? "");
  if (!text.trim()) return false;

  event.preventDefault();
  send(text);
  return true;
}
