const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const MAX_LIST = 50;

function error(code, status = 502) {
  const err = new Error(code);
  err.code = code;
  err.status = status;
  return err;
}

function text(value, code, max = 4000, { required = true } = {}) {
  const normalized = String(value ?? '').trim();
  if (required && !normalized) throw error(code, 400);
  if (normalized.length > max) throw error(code, 400);
  return normalized;
}

function listLimit(value, fallback = 20) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(1, Math.min(MAX_LIST, n)) : fallback;
}

function fixedTokenResolver(env = {}) {
  return async connectorId => {
    const keys = {
      gmail: 'GMAIL_ACCESS_TOKEN',
      'google-calendar': 'GOOGLE_CALENDAR_ACCESS_TOKEN',
      'google-tasks': 'GOOGLE_TASKS_ACCESS_TOKEN',
    };
    return String(env[keys[connectorId]] || '').trim();
  };
}

function encodePath(value, code, max = 300) {
  const v = text(value, code, max);
  if (v.includes('/') || v.includes('..')) throw error(code, 400);
  return encodeURIComponent(v);
}

function query(params = {}) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out.set(key, String(value));
  }
  return out.toString();
}

async function requestJson(fetchImpl, token, url, { method = 'GET', body, code = 'GOOGLE_REQUEST_FAILED', signal } = {}) {
  if (!token) throw error(code.replace(/_FAILED$/, '') + '_AUTH_REQUIRED', 503);
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: signal || AbortSignal.timeout(10000),
    });
  } catch {
    throw error(code, 503);
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel?.();
    throw error(code + '_AUTH', 403);
  }
  if (response.status === 429) {
    await response.body?.cancel?.();
    throw error(code + '_RATE_LIMITED', 503);
  }
  if (!response.ok) {
    await response.body?.cancel?.();
    throw error(code, response.status >= 400 && response.status < 600 ? response.status : 502);
  }
  if (response.status === 204) return {};
  const raw = await response.text();
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch { throw error(code + '_INVALID_RESPONSE', 502); }
}

function safeEmail(value) {
  const email = text(value, 'GMAIL_EMAIL_INVALID', 320);
  if (/[
]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error('GMAIL_EMAIL_INVALID', 400);
  return email;
}

function safeEmails(values, max = 20) {
  if (!Array.isArray(values) || values.length < 1 || values.length > max) throw error('GMAIL_RECIPIENTS_INVALID', 400);
  return [...new Set(values.map(safeEmail))];
}

function optionalEmails(values, max = 20) {
  if (values == null) return [];
  if (!Array.isArray(values) || values.length > max) throw error('GMAIL_RECIPIENTS_INVALID', 400);
  return [...new Set(values.map(safeEmail))];
}

function header(value, code, max) {
  const v = text(value, code, max);
  if (/[
]/.test(v)) throw error(code, 400);
  return v;
}

function base64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function mimeMessage(input) {
  const to = safeEmails(input.to);
  const cc = optionalEmails(input.cc);
  const bcc = optionalEmails(input.bcc);
  const subject = header(input.subject, 'GMAIL_SUBJECT_INVALID', 998);
  const body = String(input.body ?? '');
  if (!body.trim() || body.length > 100000) throw error('GMAIL_BODY_INVALID', 400);
  const lines = [
    'To: ' + to.join(', '),
    ...(cc.length ? ['Cc: ' + cc.join(', ')] : []),
    ...(bcc.length ? ['Bcc: ' + bcc.join(', ')] : []),
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ];
  return base64UrlUtf8(lines.join('\r\n'));
}

function calendarEvent(input, { partial = false } = {}) {
  const event = {};
  if (!partial || input.summary !== undefined) event.summary = text(input.summary, 'CALENDAR_SUMMARY_INVALID', 1000, { required: !partial });
  if (input.description !== undefined) event.description = text(input.description, 'CALENDAR_DESCRIPTION_INVALID', 12000, { required: false });
  if (input.location !== undefined) event.location = text(input.location, 'CALENDAR_LOCATION_INVALID', 1000, { required: false });
  if (!partial || input.start !== undefined) event.start = { dateTime: text(input.start, 'CALENDAR_START_INVALID', 80) };
  if (!partial || input.end !== undefined) event.end = { dateTime: text(input.end, 'CALENDAR_END_INVALID', 80) };
  if (input.timeZone) {
    const tz = text(input.timeZone, 'CALENDAR_TIMEZONE_INVALID', 100);
    if (event.start) event.start.timeZone = tz;
    if (event.end) event.end.timeZone = tz;
  }
  if (input.attendees !== undefined) {
    const attendees = optionalEmails(input.attendees, 50);
    event.attendees = attendees.map(email => ({ email }));
  }
  return event;
}

function taskBody(input, { partial = false } = {}) {
  const body = {};
  if (!partial || input.title !== undefined) body.title = text(input.title, 'TASK_TITLE_INVALID', 1024, { required: !partial });
  if (input.notes !== undefined) body.notes = text(input.notes, 'TASK_NOTES_INVALID', 8192, { required: false });
  if (input.due !== undefined) body.due = text(input.due, 'TASK_DUE_INVALID', 80, { required: false });
  if (input.status !== undefined) {
    const status = text(input.status, 'TASK_STATUS_INVALID', 32);
    if (!['needsAction', 'completed'].includes(status)) throw error('TASK_STATUS_INVALID', 400);
    body.status = status;
  }
  return body;
}

async function tokenFor(resolveAccessToken, connectorId, context) {
  const token = String(await resolveAccessToken(connectorId, context) || '').trim();
  if (!token) throw error(connectorId.toUpperCase().replaceAll('-', '_') + '_AUTH_REQUIRED', 503);
  return token;
}

const objectOutput = { type: 'object', additionalProperties: true };

export function registerGoogleWorkspaceCapabilities(bus, { env = {}, fetchImpl = fetch, resolveAccessToken = null } = {}) {
  if (!bus || typeof bus.discover !== 'function') throw new TypeError('CAPABILITY_BUS_REQUIRED');
  const resolveToken = resolveAccessToken || fixedTokenResolver(env);

  bus.discover({
    id: 'gmail.messages.search',
    name: 'Gmail message search',
    category: 'communication',
    version: '1.0.0',
    provider: 'google',
    description: 'Searches Gmail with a bounded Gmail query and returns message identifiers only.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 1000 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output_schema: objectOutput,
    risk: 'LOW',
    permissions: ['google.gmail.read'],
    health: 'DEGRADED',
    enabled: true,
  }, async (input, context) => {
    const token = await tokenFor(resolveToken, 'gmail', context);
    const q = text(input.query, 'GMAIL_QUERY_INVALID', 1000);
    const url = GMAIL_API + '/messages?' + query({ q, maxResults: listLimit(input.limit) });
    const body = await requestJson(fetchImpl, token, url, { code: 'GMAIL_SEARCH_FAILED', signal: context?.signal });
    const messages = (Array.isArray(body.messages) ? body.messages : []).slice(0, listLimit(input.limit)).map(row => ({
      id: String(row.id || ''),
      thread_id: String(row.threadId || ''),
    }));
    return { provider: 'google', query: q, messages, count: messages.length };
  });

  bus.discover({
    id: 'gmail.messages.read',
    name: 'Gmail message read',
    category: 'communication',
    version: '1.0.0',
    provider: 'google',
    description: 'Reads one Gmail message by fixed message id.',
    input_schema: {
      type: 'object',
      properties: { message_id: { type: 'string', minLength: 1, maxLength: 300 } },
      required: ['message_id'],
      additionalProperties: false,
    },
    output_schema: objectOutput,
    risk: 'LOW',
    permissions: ['google.gmail.read'],
    health: 'DEGRADED',
    enabled: true,
  }, async (input, context) => {
    const token = await tokenFor(resolveToken, 'gmail', context);
    const id = encodePath(input.message_id, 'GMAIL_MESSAGE_ID_INVALID');
    const body = await requestJson(fetchImpl, token, GMAIL_API + '/messages/' + id + '?format=full', { code: 'GMAIL_READ_FAILED', signal: context?.signal });
    return { provider: 'google', message: body };
  });

  for (const [id, draft, approvalScope] of [
    ['gmail.drafts.create', true, 'gmail.drafts.create'],
    ['gmail.messages.send', false, 'gmail.messages.send'],
  ]) {
    bus.discover({
      id,
      name: draft ? 'Gmail draft create' : 'Gmail send message',
      category: 'communication',
      version: '1.0.0',
      provider: 'google',
      description: draft
        ? 'Creates one bounded Gmail draft after explicit owner approval.'
        : 'Sends one bounded plain-text Gmail message after explicit owner approval.',
      input_schema: {
        type: 'object',
        properties: {
          to: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 3, maxLength: 320 } },
          cc: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 3, maxLength: 320 } },
          bcc: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 3, maxLength: 320 } },
          subject: { type: 'string', minLength: 1, maxLength: 998 },
          body: { type: 'string', minLength: 1, maxLength: 100000 },
        },
        required: ['to', 'subject', 'body'],
        additionalProperties: false,
      },
      output_schema: objectOutput,
      risk: draft ? 'MEDIUM' : 'HIGH',
      permissions: [draft ? 'google.gmail.draft' : 'google.gmail.send'],
      approval: { required: true, scope: approvalScope, reason: draft ? 'GMAIL_DRAFT_MUTATION' : 'GMAIL_SEND_MUTATION' },
      health: 'DEGRADED',
      enabled: true,
    }, async (input, context) => {
      const token = await tokenFor(resolveToken, 'gmail', context);
      const raw = mimeMessage(input);
      const endpoint = draft ? GMAIL_API + '/drafts' : GMAIL_API + '/messages/send';
      const body = await requestJson(fetchImpl, token, endpoint, {
        method: 'POST',
        body: draft ? { message: { raw } } : { raw },
        code: draft ? 'GMAIL_DRAFT_CREATE_FAILED' : 'GMAIL_SEND_FAILED',
        signal: context?.signal,
      });
      return {
        provider: 'google',
        accepted: true,
        draft_id: draft ? String(body.id || '') : '',
        message_id: draft ? String(body.message?.id || '') : String(body.id || ''),
        thread_id: draft ? String(body.message?.threadId || '') : String(body.threadId || ''),
      };
    });
  }

  bus.discover({
    id: 'calendar.events.read',
    name: 'Google Calendar event search',
    category: 'planning',
    version: '1.0.0',
    provider: 'google',
    description: 'Reads a bounded set of events from one Google calendar.',
    input_schema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', minLength: 1, maxLength: 300 },
        time_min: { type: 'string', maxLength: 80 },
        time_max: { type: 'string', maxLength: 80 },
        query: { type: 'string', maxLength: 1000 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      additionalProperties: false,
    },
    output_schema: objectOutput,
    risk: 'LOW',
    permissions: ['google.calendar.read'],
    health: 'DEGRADED',
    enabled: true,
  }, async (input, context) => {
    const token = await tokenFor(resolveToken, 'google-calendar', context);
    const calendarId = encodeURIComponent(text(input.calendar_id || 'primary', 'CALENDAR_ID_INVALID', 300));
    const params = query({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: listLimit(input.limit),
      timeMin: input.time_min ? text(input.time_min, 'CALENDAR_TIME_INVALID', 80) : '',
      timeMax: input.time_max ? text(input.time_max, 'CALENDAR_TIME_INVALID', 80) : '',
      q: input.query ? text(input.query, 'CALENDAR_QUERY_INVALID', 1000) : '',
    });
    const body = await requestJson(fetchImpl, token, CALENDAR_API + '/calendars/' + calendarId + '/events?' + params, { code: 'CALENDAR_READ_FAILED', signal: context?.signal });
    const events = (Array.isArray(body.items) ? body.items : []).slice(0, listLimit(input.limit));
    return { provider: 'google', calendar_id: input.calendar_id || 'primary', events, count: events.length };
  });

  for (const spec of [
    { id: 'calendar.events.create', method: 'POST', action: 'create', permission: 'google.calendar.write', risk: 'HIGH' },
    { id: 'calendar.events.update', method: 'PATCH', action: 'update', permission: 'google.calendar.write', risk: 'HIGH' },
    { id: 'calendar.events.delete', method: 'DELETE', action: 'delete', permission: 'google.calendar.delete', risk: 'HIGH' },
  ]) {
    bus.discover({
      id: spec.id,
      name: 'Google Calendar event ' + spec.action,
      category: 'planning',
      version: '1.0.0',
      provider: 'google',
      description: 'Mutates one Google Calendar event after explicit owner approval.',
      input_schema: {
        type: 'object',
        properties: {
          calendar_id: { type: 'string', minLength: 1, maxLength: 300 },
          event_id: { type: 'string', minLength: 1, maxLength: 300 },
          summary: { type: 'string', maxLength: 1000 },
          description: { type: 'string', maxLength: 12000 },
          location: { type: 'string', maxLength: 1000 },
          start: { type: 'string', maxLength: 80 },
          end: { type: 'string', maxLength: 80 },
          timeZone: { type: 'string', maxLength: 100 },
          attendees: { type: 'array', maxItems: 50, items: { type: 'string', minLength: 3, maxLength: 320 } },
        },
        ...(spec.action === 'create' ? { required: ['summary', 'start', 'end'] } : { required: ['event_id'] }),
        additionalProperties: false,
      },
      output_schema: objectOutput,
      risk: spec.risk,
      permissions: [spec.permission],
      approval: { required: true, scope: spec.id, reason: 'CALENDAR_EVENT_MUTATION' },
      health: 'DEGRADED',
      enabled: true,
    }, async (input, context) => {
      const token = await tokenFor(resolveToken, 'google-calendar', context);
      const calendarId = encodeURIComponent(text(input.calendar_id || 'primary', 'CALENDAR_ID_INVALID', 300));
      const base = CALENDAR_API + '/calendars/' + calendarId + '/events';
      let url = base;
      let body;
      if (spec.action === 'create') body = calendarEvent(input);
      else {
        const eventId = encodePath(input.event_id, 'CALENDAR_EVENT_ID_INVALID');
        url += '/' + eventId;
        if (spec.action === 'update') body = calendarEvent(input, { partial: true });
      }
      const result = await requestJson(fetchImpl, token, url, {
        method: spec.method,
        body,
        code: 'CALENDAR_' + spec.action.toUpperCase() + '_FAILED',
        signal: context?.signal,
      });
      return { provider: 'google', calendar_id: input.calendar_id || 'primary', event_id: String(result.id || input.event_id || ''), accepted: true };
    });
  }

  bus.discover({
    id: 'tasks.tasklists.read',
    name: 'Google Tasks lists read',
    category: 'planning',
    version: '1.0.0',
    provider: 'google',
    description: 'Lists bounded Google Tasks task lists.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_LIST } },
      additionalProperties: false,
    },
    output_schema: objectOutput,
    risk: 'LOW',
    permissions: ['google.tasks.read'],
    health: 'DEGRADED',
    enabled: true,
  }, async (input, context) => {
    const token = await tokenFor(resolveToken, 'google-tasks', context);
    const limit = listLimit(input.limit);
    const body = await requestJson(fetchImpl, token, TASKS_API + '/users/@me/lists?' + query({ maxResults: limit }), { code: 'TASKLISTS_READ_FAILED', signal: context?.signal });
    const tasklists = (Array.isArray(body.items) ? body.items : []).slice(0, limit);
    return { provider: 'google', tasklists, count: tasklists.length };
  });

  bus.discover({
    id: 'tasks.tasks.read',
    name: 'Google Tasks read',
    category: 'planning',
    version: '1.0.0',
    provider: 'google',
    description: 'Lists bounded tasks in one Google Tasks task list.',
    input_schema: {
      type: 'object',
      properties: {
        tasklist_id: { type: 'string', minLength: 1, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
        show_completed: { type: 'boolean' },
      },
      required: ['tasklist_id'],
      additionalProperties: false,
    },
    output_schema: objectOutput,
    risk: 'LOW',
    permissions: ['google.tasks.read'],
    health: 'DEGRADED',
    enabled: true,
  }, async (input, context) => {
    const token = await tokenFor(resolveToken, 'google-tasks', context);
    const tasklist = encodePath(input.tasklist_id, 'TASKLIST_ID_INVALID');
    const limit = listLimit(input.limit);
    const body = await requestJson(fetchImpl, token, TASKS_API + '/lists/' + tasklist + '/tasks?' + query({
      maxResults: limit,
      showCompleted: input.show_completed === false ? 'false' : 'true',
    }), { code: 'TASKS_READ_FAILED', signal: context?.signal });
    const tasks = (Array.isArray(body.items) ? body.items : []).slice(0, limit);
    return { provider: 'google', tasklist_id: input.tasklist_id, tasks, count: tasks.length };
  });

  for (const spec of [
    { id: 'tasks.tasks.create', method: 'POST', action: 'create', permission: 'google.tasks.write' },
    { id: 'tasks.tasks.update', method: 'PATCH', action: 'update', permission: 'google.tasks.write' },
    { id: 'tasks.tasks.delete', method: 'DELETE', action: 'delete', permission: 'google.tasks.delete' },
  ]) {
    bus.discover({
      id: spec.id,
      name: 'Google Tasks ' + spec.action,
      category: 'planning',
      version: '1.0.0',
      provider: 'google',
      description: 'Mutates one Google task after explicit owner approval.',
      input_schema: {
        type: 'object',
        properties: {
          tasklist_id: { type: 'string', minLength: 1, maxLength: 300 },
          task_id: { type: 'string', minLength: 1, maxLength: 300 },
          title: { type: 'string', maxLength: 1024 },
          notes: { type: 'string', maxLength: 8192 },
          due: { type: 'string', maxLength: 80 },
          status: { type: 'string', enum: ['needsAction', 'completed'] },
        },
        required: spec.action === 'create' ? ['tasklist_id', 'title'] : ['tasklist_id', 'task_id'],
        additionalProperties: false,
      },
      output_schema: objectOutput,
      risk: 'HIGH',
      permissions: [spec.permission],
      approval: { required: true, scope: spec.id, reason: 'GOOGLE_TASK_MUTATION' },
      health: 'DEGRADED',
      enabled: true,
    }, async (input, context) => {
      const token = await tokenFor(resolveToken, 'google-tasks', context);
      const tasklist = encodePath(input.tasklist_id, 'TASKLIST_ID_INVALID');
      let url = TASKS_API + '/lists/' + tasklist + '/tasks';
      let body;
      if (spec.action === 'create') body = taskBody(input);
      else {
        const taskId = encodePath(input.task_id, 'TASK_ID_INVALID');
        url += '/' + taskId;
        if (spec.action === 'update') body = taskBody(input, { partial: true });
      }
      const result = await requestJson(fetchImpl, token, url, {
        method: spec.method,
        body,
        code: 'TASKS_' + spec.action.toUpperCase() + '_FAILED',
        signal: context?.signal,
      });
      return { provider: 'google', tasklist_id: input.tasklist_id, task_id: String(result.id || input.task_id || ''), accepted: true };
    });
  }

  return Object.freeze([
    'gmail.messages.search',
    'gmail.messages.read',
    'gmail.drafts.create',
    'gmail.messages.send',
    'calendar.events.read',
    'calendar.events.create',
    'calendar.events.update',
    'calendar.events.delete',
    'tasks.tasklists.read',
    'tasks.tasks.read',
    'tasks.tasks.create',
    'tasks.tasks.update',
    'tasks.tasks.delete',
  ]);
}
