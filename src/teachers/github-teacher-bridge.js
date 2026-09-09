const DEFAULT_REQUESTS_PATH = 'teacher-bridge/requests.jsonl';
const DEFAULT_REPLIES_PATH = 'teacher-bridge/replies.jsonl';

function requireText(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw Object.assign(new Error(`${name.toUpperCase()}_REQUIRED`), { code: `${name.toUpperCase()}_REQUIRED` });
  return text;
}

function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function decodeUtf8Base64(value) {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseJsonLines(text) {
  const rows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') rows.push(parsed);
    } catch {}
  }
  return rows;
}

export class MemoryTeacherBridgeState {
  constructor() { this.requestIds = new Set(); this.replyIds = new Set(); }
  async hasRequest(id) { return this.requestIds.has(id); }
  async markRequest(id) { this.requestIds.add(id); }
  async hasReply(id) { return this.replyIds.has(id); }
  async markReply(id) { this.replyIds.add(id); }
}

export class GitHubTeacherBridge {
  constructor({
    repository,
    branch = 'main',
    token,
    fetchImpl = fetch,
    state = new MemoryTeacherBridgeState(),
    requestsPath = DEFAULT_REQUESTS_PATH,
    repliesPath = DEFAULT_REPLIES_PATH,
    now = () => new Date().toISOString(),
    uuid = () => crypto.randomUUID()
  } = {}) {
    this.repository = requireText(repository, 'repository');
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(this.repository)) throw Object.assign(new Error('INVALID_REPOSITORY'), { code: 'INVALID_REPOSITORY' });
    this.branch = requireText(branch, 'branch');
    this.token = requireText(token, 'token');
    this.fetch = fetchImpl;
    this.state = state;
    this.requestsPath = requestsPath;
    this.repliesPath = repliesPath;
    this.now = now;
    this.uuid = uuid;
  }

  headers() {
    return {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${this.token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'meliturgos-teacher-bridge'
    };
  }

  contentsUrl(path) {
    return `https://api.github.com/repos/${this.repository}/contents/${path}`;
  }

  async readFile(path) {
    const response = await this.fetch(`${this.contentsUrl(path)}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers() });
    if (!response.ok) throw Object.assign(new Error(`GITHUB_READ_${response.status}`), { code: 'TEACHER_GITHUB_READ_FAILED', status: response.status });
    const body = await response.json();
    return { text: decodeUtf8Base64(body.content || ''), sha: body.sha || null };
  }

  async appendLine(path, record, message, current = null) {
    const existing = current || await this.readFile(path);
    const prefix = existing.text && !existing.text.endsWith('\n') ? `${existing.text}\n` : existing.text;
    const content = `${prefix}${JSON.stringify(record)}\n`;
    const response = await this.fetch(this.contentsUrl(path), {
      method: 'PUT',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify({ message, content: encodeUtf8Base64(content), sha: existing.sha, branch: this.branch })
    });
    if (!response.ok) throw Object.assign(new Error(`GITHUB_WRITE_${response.status}`), { code: 'TEACHER_GITHUB_WRITE_FAILED', status: response.status });
    return record;
  }

  async health() {
    try {
      await this.readFile(this.requestsPath);
      await this.readFile(this.repliesPath);
      return 'ONLINE';
    } catch (error) {
      return error?.status === 401 || error?.status === 403 ? 'OFFLINE' : 'DEGRADED';
    }
  }

  async ask(input = {}) {
    const requestId = String(input.request_id || this.uuid());
    if (await this.state.hasRequest(requestId)) return { request_id: requestId, status: 'WAITING_TEACHER', duplicate: true };

    // Durable deduplication: the repository queue, not process memory, is the
    // source of truth. This survives Worker restarts and isolates at-least-once
    // callers from accidentally duplicating the same MEL_REQUEST.
    const persisted = await this.readFile(this.requestsPath);
    const exists = parseJsonLines(persisted.text).some(row => row.type === 'MEL_REQUEST' && row.request_id === requestId);
    if (exists) {
      await this.state.markRequest(requestId);
      return { request_id: requestId, status: 'WAITING_TEACHER', duplicate: true };
    }

    const record = {
      type: 'MEL_REQUEST',
      request_id: requestId,
      created_at: this.now(),
      area: String(input.area || 'other'),
      priority: String(input.priority || 'medium'),
      status: 'WAITING_TEACHER',
      goal: requireText(input.goal, 'goal'),
      current_state: String(input.current_state || ''),
      evidence: String(input.evidence || ''),
      blocker_or_question: requireText(input.blocker_or_question, 'blocker_or_question'),
      proposed_next_step: String(input.proposed_next_step || ''),
      safety: {
        no_production_deploy: true,
        no_dns_change: true,
        no_secret_exposure: true,
        no_destructive_d1: true,
        candidate_branch_only: true
      }
    };
    await this.appendLine(this.requestsPath, record, `teacher: MEL request ${requestId}`, persisted);
    await this.state.markRequest(requestId);
    return { request_id: requestId, status: 'WAITING_TEACHER', duplicate: false };
  }

  async poll(requestId) {
    const id = requireText(requestId, 'request_id');
    if (await this.state.hasReply(id)) return { request_id: id, status: 'ALREADY_CONSUMED', reply: null };
    const current = await this.readFile(this.repliesPath);
    const reply = parseJsonLines(current.text).reverse().find(row => row.type === 'TEACHER_REPLY' && row.request_id === id);
    if (!reply) return { request_id: id, status: 'WAITING_TEACHER', reply: null };
    await this.state.markReply(id);
    return { request_id: id, status: 'ANSWERED', reply };
  }
}
