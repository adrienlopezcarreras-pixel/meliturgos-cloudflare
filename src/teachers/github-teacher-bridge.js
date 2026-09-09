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

  async queueUnique(record, message) {
    const requestId = requireText(record.request_id, 'request_id');
    if (await this.state.hasRequest(requestId)) return { request_id: requestId, status: record.status, duplicate: true };
    const persisted = await this.readFile(this.requestsPath);
    const exists = parseJsonLines(persisted.text).some(row => row.request_id === requestId && row.type === record.type);
    if (exists) {
      await this.state.markRequest(requestId);
      return { request_id: requestId, status: record.status, duplicate: true };
    }
    await this.appendLine(this.requestsPath, record, message, persisted);
    await this.state.markRequest(requestId);
    return { request_id: requestId, status: record.status, duplicate: false };
  }

  async ask(input = {}) {
    const requestId = String(input.request_id || this.uuid());
    const record = {
      type: 'MEL_REQUEST', request_id: requestId, created_at: this.now(), area: String(input.area || 'other'), priority: String(input.priority || 'medium'), status: 'WAITING_TEACHER',
      goal: requireText(input.goal, 'goal'), current_state: String(input.current_state || ''), evidence: String(input.evidence || ''),
      blocker_or_question: requireText(input.blocker_or_question, 'blocker_or_question'), proposed_next_step: String(input.proposed_next_step || ''),
      safety: { no_production_deploy: true, no_dns_change: true, no_secret_exposure: true, no_destructive_d1: true, candidate_branch_only: true }
    };
    return this.queueUnique(record, `teacher: MEL request ${requestId}`);
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

  async requestDeployment(input = {}) {
    const requestId = String(input.request_id || this.uuid());
    const candidateBranch = requireText(input.candidate_branch, 'candidate_branch');
    const candidateCommit = requireText(input.candidate_commit, 'candidate_commit');
    if (!candidateBranch.startsWith('candidate/')) throw Object.assign(new Error('DEPLOYMENT_CANDIDATE_BRANCH_REQUIRED'), { code: 'DEPLOYMENT_CANDIDATE_BRANCH_REQUIRED' });
    if (!/^[0-9a-f]{7,40}$/i.test(candidateCommit)) throw Object.assign(new Error('DEPLOYMENT_COMMIT_INVALID'), { code: 'DEPLOYMENT_COMMIT_INVALID' });
    const required = ['change_summary','files_components_affected','user_visible_impact','tests_ci_results','benchmark_regression_results','security_privacy_impact','secrets_permissions_impact','data_schema_migration_impact','compatibility_risks','rollout_plan','health_checks','rollback_plan','known_unknowns_blockers'];
    const evidence = {};
    for (const field of required) evidence[field] = requireText(input[field], field);
    evidence.dependency_licensing_impact = String(input.dependency_licensing_impact || 'none identified');
    const record = {
      type: 'DEPLOYMENT_REQUEST', request_id: requestId, created_at: this.now(), status: 'WAITING_DEPLOY_REVIEW',
      candidate_branch: candidateBranch, candidate_commit: candidateCommit, ...evidence,
      boundaries: { exact_commit_only: true, no_implicit_later_commit: true, no_new_credentials: true, no_billing_change: true, no_dns_auth_change: true, no_destructive_data_operation: true, no_irreversible_migration: true }
    };
    return this.queueUnique(record, `deploy: request review ${requestId} ${candidateCommit}`);
  }

  async pollDeployment(requestId, candidateBranch, candidateCommit) {
    const id = requireText(requestId, 'request_id');
    const branch = requireText(candidateBranch, 'candidate_branch');
    const commit = requireText(candidateCommit, 'candidate_commit');
    const current = await this.readFile(this.repliesPath);
    const review = parseJsonLines(current.text).reverse().find(row => row.type === 'DEPLOYMENT_REVIEW' && row.request_id === id);
    if (!review) return { request_id: id, status: 'WAITING_DEPLOY_REVIEW', review: null, authorized: false };
    const decision = String(review.decision || 'DEPLOY_NEEDS_CHANGES');
    const exact = review.candidate_branch === branch && review.candidate_commit === commit;
    const authorized = exact && decision === 'DEPLOY_APPROVED';
    return { request_id: id, status: decision, review, authorized, exact_commit_match: exact };
  }
}
