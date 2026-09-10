import fs from 'node:fs/promises';
import path from 'node:path';

const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function sanitize(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = sanitize(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 12000);
}

async function readJsonl(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export class JsonlTeacherChannel {
  constructor({ repoRoot = process.cwd(), requestsPath = 'teacher-bridge/requests.jsonl', repliesPath = 'teacher-bridge/replies.jsonl' } = {}) {
    this.repoRoot = path.resolve(repoRoot);
    this.requestsFile = path.resolve(this.repoRoot, requestsPath);
    this.repliesFile = path.resolve(this.repoRoot, repliesPath);
    for (const file of [this.requestsFile, this.repliesFile]) {
      if (file !== this.repoRoot && !file.startsWith(`${this.repoRoot}${path.sep}`)) {
        throw Object.assign(new Error('TEACHER_CHANNEL_PATH_DENIED'), { code: 'TEACHER_CHANNEL_PATH_DENIED' });
      }
    }
  }

  async publishRequest(request, metadata = {}) {
    const requestId = String(request?.request_id || '');
    if (!requestId) throw Object.assign(new Error('TEACHER_REQUEST_ID_REQUIRED'), { code: 'TEACHER_REQUEST_ID_REQUIRED' });
    const existing = await readJsonl(this.requestsFile);
    if (existing.some((entry) => String(entry.request_id || '') === requestId)) {
      return { request_id: requestId, published: false, duplicate: true };
    }
    await fs.mkdir(path.dirname(this.requestsFile), { recursive: true });
    const record = sanitize({
      kind: 'MEL_REQUEST',
      type: request.type || 'MEL_TEACHER_REVIEW_REQUEST',
      request_id: requestId,
      created_at: request.created_at || new Date().toISOString(),
      status: 'WAITING_TEACHER',
      request,
      metadata,
    });
    await fs.appendFile(this.requestsFile, `${JSON.stringify(record)}\n`, 'utf8');
    return { request_id: requestId, published: true, duplicate: false };
  }

  async getReply(requestId) {
    const wanted = String(requestId || '');
    if (!wanted) return null;
    const replies = await readJsonl(this.repliesFile);
    const record = [...replies].reverse().find((entry) => String(entry.request_id || '') === wanted);
    if (!record) return null;
    return sanitize(record.review || record.reply || record);
  }
}

export { readJsonl };
