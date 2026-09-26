const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

function capabilityError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function text(value, max = 12000) {
  return String(value ?? '').trim().slice(0, max);
}

function requiredText(value, code, max = 12000) {
  const out = text(value, max);
  if (!out) throw capabilityError(code, 400);
  return out;
}

function headerValue(value, code, max = 500) {
  const out = requiredText(value, code, max);
  if (/[\r\n]/.test(out)) throw capabilityError(code, 400);
  return out;
}

function token(env, key, code) {
  const value = text(env?.[key], 10000);
  if (!value) throw capabilityError(code, 503);
  return value;
}

function boundedInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function isoDate(value, code) {
  const raw = requiredText(value, code, 80);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw capabilityError(code, 400);
  return new Date(parsed).toISOString();
}

function base64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function decodeBase64UrlUtf8(value) {
  const raw = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = raw + '='.repeat((4 - raw.length % 4) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

async function requestJson(fetchImpl, url, { method = 'GET', accessToken, body, code }) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      authorization: 'Bearer ' + accessToken,
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) {
    try { await response.body?.cancel(); } catch {}
    return { ok: true };
  }
  const raw = await response.text();
  if (raw.length > 1_000_000) throw capabilityError('GOOGLE_RESPONSE_TOO_LARGE', 502);
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { throw capabilityError(code, 502); }
  if (!response.ok) {
    const error = capabilityError(code, response.status === 401 || response.status === 403 ? 503 : 502);
    error.provider_status = response.status;
    throw error;
  }
  return parsed;
}

function headerMap(payload = {}) {
  const rows = Array.isArray(payload?.payload?.headers) ? payload.payload.headers : [];
  const out = {};
  for (const row of rows) {
    const name = text(row?.name, 80).toLowerCase();
    if (name && out[name] === undefined) out[name] = text(row?.value, 2000);
  }
  return out;
}

function gmailMessage(row = {}) {
  const headers = headerMap(row);
  return {
    id: text(row.id, 200),
    thread_id: text(row.threadId, 200),
    snippet: text(row.snippet, 4000),
    subject: text(headers.subject, 2000),
    from: text(headers.from, 1000),
    to: text(headers.to, 1000),
    date: text(headers.date, 200),
    internal_date: text(row.internalDate, 80),
  };
}

function mimeMessage(input = {}) {
  const to = headerValue(input.to, 'MAIL_TO_REQUIRED', 1000);
  const subject = headerValue(input.subject, 'MAIL_SUBJECT_REQUIRED', 1000);
  const body = requiredText(input.body, 'MAIL_BODY_REQUIRED', 50000);
  const headers = [
    'To: ' + to,
    ...(input.cc ? ['Cc: ' + headerValue(input.cc, 'MAIL_CC_INVALID', 1000)] : []),
    ...(input.bcc ? ['Bcc: ' + headerValue(input.bcc, 'MAIL_BCC_INVALID', 1000)] : []),
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  return base64UrlUtf8(headers.join('\r\n') + '\r\n\r\n' + body);
}

function healthByToken(env, key, missingCode) {
  return async () => env?.[key]
    ? { status: 'HEALTHY' }
    : { status: 'UNAVAILABLE', code: missingCode };
}

const emptyObjectSchema = { type: 'object', additionalProperties: true };

export function registerGooglePersonalAgentCapabilities(bus, env = {}, { fetchImpl = fetch } = {}) {
  const registered = [];

  const add = (record, handler, healthcheck) => {
    bus.discover(record, handler, healthcheck);
    registered.push(record.id);
  };

  add({
    id: 'gmail.messages.search',
    name: 'Rechercher dans Gmail',
    category: 'communication',
    version: '1.0.0',
    provider: 'google',
    description: 'Recherche des messages Gmail avec une requête Gmail bornée et renvoie uniquement des identifiants et aperçus.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 1000 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'LOW',
    permissions: ['personal.mail.read'],
    health: env.GMAIL_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED');
    const params = new URLSearchParams({
      q: requiredText(input.query, 'GMAIL_QUERY_REQUIRED', 1000),
      maxResults: String(boundedInt(input.limit, 20, 1, 50)),
    });
    const data = await requestJson(fetchImpl, GMAIL_API + '/messages?' + params.toString(), {
      accessToken,
      code: 'GMAIL_SEARCH_FAILED',
    });
    return {
      messages: (Array.isArray(data.messages) ? data.messages : []).map(row => ({
        id: text(row.id, 200),
        thread_id: text(row.threadId, 200),
      })),
      result_size_estimate: Number(data.resultSizeEstimate || 0),
    };
  }, healthByToken(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED'));

  add({
    id: 'gmail.messages.read',
    name: 'Lire un message Gmail',
    category: 'communication',
    version: '1.0.0',
    provider: 'google',
    description: 'Lit un message Gmail précis par identifiant sans modifier la boîte.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['id'],
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'LOW',
    permissions: ['personal.mail.read'],
    health: env.GMAIL_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED');
    const id = requiredText(input.id, 'GMAIL_MESSAGE_ID_REQUIRED', 200);
    const params = new URLSearchParams({ format: 'metadata' });
    for (const header of ['Subject', 'From', 'To', 'Date']) params.append('metadataHeaders', header);
    const data = await requestJson(fetchImpl, GMAIL_API + '/messages/' + encodeURIComponent(id) + '?' + params.toString(), {
      accessToken,
      code: 'GMAIL_READ_FAILED',
    });
    return gmailMessage(data);
  }, healthByToken(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED'));

  add({
    id: 'gmail.drafts.create',
    name: 'Créer un brouillon Gmail',
    category: 'communication',
    version: '1.0.0',
    provider: 'google',
    description: 'Crée un brouillon Gmail mais ne l’envoie jamais.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', minLength: 1, maxLength: 1000 },
        cc: { type: 'string', minLength: 1, maxLength: 1000 },
        bcc: { type: 'string', minLength: 1, maxLength: 1000 },
        subject: { type: 'string', minLength: 1, maxLength: 1000 },
        body: { type: 'string', minLength: 1, maxLength: 50000 },
        thread_id: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'MEDIUM',
    permissions: ['personal.mail.write'],
    approval: { required: true, scope: 'gmail.drafts.create', reason: 'MAILBOX_MUTATION' },
    health: env.GMAIL_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED');
    const data = await requestJson(fetchImpl, GMAIL_API + '/drafts', {
      method: 'POST',
      accessToken,
      body: {
        message: {
          raw: mimeMessage(input),
          ...(input.thread_id ? { threadId: requiredText(input.thread_id, 'GMAIL_THREAD_ID_INVALID', 200) } : {}),
        },
      },
      code: 'GMAIL_DRAFT_CREATE_FAILED',
    });
    return {
      draft_id: text(data.id, 200),
      message_id: text(data?.message?.id, 200),
      thread_id: text(data?.message?.threadId, 200),
    };
  }, healthByToken(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED'));

  add({
    id: 'gmail.messages.send',
    name: 'Envoyer un email Gmail',
    category: 'communication',
    version: '1.0.0',
    provider: 'google',
    description: 'Envoie un email Gmail uniquement après approbation explicite de cette capacité.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', minLength: 1, maxLength: 1000 },
        cc: { type: 'string', minLength: 1, maxLength: 1000 },
        bcc: { type: 'string', minLength: 1, maxLength: 1000 },
        subject: { type: 'string', minLength: 1, maxLength: 1000 },
        body: { type: 'string', minLength: 1, maxLength: 50000 },
        thread_id: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'HIGH',
    permissions: ['personal.mail.send'],
    approval: { required: true, scope: 'gmail.messages.send', reason: 'EXTERNAL_MESSAGE_SEND' },
    health: env.GMAIL_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED');
    const data = await requestJson(fetchImpl, GMAIL_API + '/messages/send', {
      method: 'POST',
      accessToken,
      body: {
        raw: mimeMessage(input),
        ...(input.thread_id ? { threadId: requiredText(input.thread_id, 'GMAIL_THREAD_ID_INVALID', 200) } : {}),
      },
      code: 'GMAIL_SEND_FAILED',
    });
    return {
      id: text(data.id, 200),
      thread_id: text(data.threadId, 200),
      label_ids: Array.isArray(data.labelIds) ? data.labelIds.slice(0, 50).map(value => text(value, 100)) : [],
    };
  }, healthByToken(env, 'GMAIL_ACCESS_TOKEN', 'GMAIL_AUTH_REQUIRED'));

  add({
    id: 'calendar.events.list',
    name: 'Lire l’agenda Google',
    category: 'calendar',
    version: '1.0.0',
    provider: 'google',
    description: 'Liste les événements d’un agenda Google dans une fenêtre de temps bornée.',
    input_schema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', minLength: 1, maxLength: 500 },
        time_min: { type: 'string', minLength: 1, maxLength: 80 },
        time_max: { type: 'string', minLength: 1, maxLength: 80 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'LOW',
    permissions: ['personal.calendar.read'],
    health: env.GOOGLE_CALENDAR_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED');
    const calendarId = text(input.calendar_id, 500) || 'primary';
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(boundedInt(input.limit, 25, 1, 100)),
    });
    if (input.time_min) params.set('timeMin', isoDate(input.time_min, 'CALENDAR_TIME_MIN_INVALID'));
    if (input.time_max) params.set('timeMax', isoDate(input.time_max, 'CALENDAR_TIME_MAX_INVALID'));
    const data = await requestJson(fetchImpl, CALENDAR_API + '/calendars/' + encodeURIComponent(calendarId) + '/events?' + params.toString(), {
      accessToken,
      code: 'CALENDAR_LIST_FAILED',
    });
    return {
      time_zone: text(data.timeZone, 100),
      events: (Array.isArray(data.items) ? data.items : []).slice(0, 100).map(row => ({
        id: text(row.id, 300),
        status: text(row.status, 80),
        summary: text(row.summary, 2000),
        description: text(row.description, 8000),
        location: text(row.location, 1000),
        start: text(row?.start?.dateTime || row?.start?.date, 100),
        end: text(row?.end?.dateTime || row?.end?.date, 100),
        html_link: text(row.htmlLink, 1000),
      })),
    };
  }, healthByToken(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED'));

  const calendarMutationSchema = {
    type: 'object',
    properties: {
      calendar_id: { type: 'string', minLength: 1, maxLength: 500 },
      event_id: { type: 'string', minLength: 1, maxLength: 300 },
      summary: { type: 'string', minLength: 1, maxLength: 2000 },
      description: { type: 'string', minLength: 0, maxLength: 8000 },
      location: { type: 'string', minLength: 0, maxLength: 1000 },
      start: { type: 'string', minLength: 1, maxLength: 80 },
      end: { type: 'string', minLength: 1, maxLength: 80 },
      time_zone: { type: 'string', minLength: 1, maxLength: 100 },
    },
    additionalProperties: false,
  };

  add({
    id: 'calendar.events.create',
    name: 'Créer un rendez-vous Google',
    category: 'calendar',
    version: '1.0.0',
    provider: 'google',
    description: 'Crée un événement Google Calendar après approbation explicite.',
    input_schema: { ...calendarMutationSchema, required: ['summary', 'start', 'end'] },
    output_schema: emptyObjectSchema,
    risk: 'HIGH',
    permissions: ['personal.calendar.write'],
    approval: { required: true, scope: 'calendar.events.create', reason: 'CALENDAR_MUTATION' },
    health: env.GOOGLE_CALENDAR_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED');
    const calendarId = text(input.calendar_id, 500) || 'primary';
    const start = isoDate(input.start, 'CALENDAR_START_INVALID');
    const end = isoDate(input.end, 'CALENDAR_END_INVALID');
    if (Date.parse(end) <= Date.parse(start)) throw capabilityError('CALENDAR_END_BEFORE_START', 400);
    const data = await requestJson(fetchImpl, CALENDAR_API + '/calendars/' + encodeURIComponent(calendarId) + '/events', {
      method: 'POST',
      accessToken,
      body: {
        summary: requiredText(input.summary, 'CALENDAR_SUMMARY_REQUIRED', 2000),
        ...(input.description !== undefined ? { description: text(input.description, 8000) } : {}),
        ...(input.location !== undefined ? { location: text(input.location, 1000) } : {}),
        start: { dateTime: start, ...(input.time_zone ? { timeZone: text(input.time_zone, 100) } : {}) },
        end: { dateTime: end, ...(input.time_zone ? { timeZone: text(input.time_zone, 100) } : {}) },
      },
      code: 'CALENDAR_CREATE_FAILED',
    });
    return { id: text(data.id, 300), status: text(data.status, 80), html_link: text(data.htmlLink, 1000) };
  }, healthByToken(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED'));

  add({
    id: 'calendar.events.update',
    name: 'Modifier un rendez-vous Google',
    category: 'calendar',
    version: '1.0.0',
    provider: 'google',
    description: 'Modifie un événement Google Calendar précis après approbation explicite.',
    input_schema: { ...calendarMutationSchema, required: ['event_id'] },
    output_schema: emptyObjectSchema,
    risk: 'HIGH',
    permissions: ['personal.calendar.write'],
    approval: { required: true, scope: 'calendar.events.update', reason: 'CALENDAR_MUTATION' },
    health: env.GOOGLE_CALENDAR_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED');
    const calendarId = text(input.calendar_id, 500) || 'primary';
    const eventId = requiredText(input.event_id, 'CALENDAR_EVENT_ID_REQUIRED', 300);
    const body = {};
    if (input.summary !== undefined) body.summary = requiredText(input.summary, 'CALENDAR_SUMMARY_INVALID', 2000);
    if (input.description !== undefined) body.description = text(input.description, 8000);
    if (input.location !== undefined) body.location = text(input.location, 1000);
    if (input.start !== undefined) body.start = { dateTime: isoDate(input.start, 'CALENDAR_START_INVALID'), ...(input.time_zone ? { timeZone: text(input.time_zone, 100) } : {}) };
    if (input.end !== undefined) body.end = { dateTime: isoDate(input.end, 'CALENDAR_END_INVALID'), ...(input.time_zone ? { timeZone: text(input.time_zone, 100) } : {}) };
    if (!Object.keys(body).length) throw capabilityError('CALENDAR_UPDATE_EMPTY', 400);
    const data = await requestJson(fetchImpl, CALENDAR_API + '/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId), {
      method: 'PATCH',
      accessToken,
      body,
      code: 'CALENDAR_UPDATE_FAILED',
    });
    return { id: text(data.id, 300), status: text(data.status, 80), html_link: text(data.htmlLink, 1000) };
  }, healthByToken(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED'));

  add({
    id: 'calendar.events.delete',
    name: 'Supprimer un rendez-vous Google',
    category: 'calendar',
    version: '1.0.0',
    provider: 'google',
    description: 'Supprime un événement Google Calendar précis après approbation explicite.',
    input_schema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string', minLength: 1, maxLength: 500 },
        event_id: { type: 'string', minLength: 1, maxLength: 300 },
      },
      required: ['event_id'],
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'HIGH',
    permissions: ['personal.calendar.write'],
    approval: { required: true, scope: 'calendar.events.delete', reason: 'CALENDAR_DELETE' },
    health: env.GOOGLE_CALENDAR_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED');
    const calendarId = text(input.calendar_id, 500) || 'primary';
    const eventId = requiredText(input.event_id, 'CALENDAR_EVENT_ID_REQUIRED', 300);
    await requestJson(fetchImpl, CALENDAR_API + '/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId), {
      method: 'DELETE',
      accessToken,
      code: 'CALENDAR_DELETE_FAILED',
    });
    return { deleted: true, event_id: eventId };
  }, healthByToken(env, 'GOOGLE_CALENDAR_ACCESS_TOKEN', 'GOOGLE_CALENDAR_AUTH_REQUIRED'));

  add({
    id: 'tasks.list',
    name: 'Lire Google Tasks',
    category: 'tasks',
    version: '1.0.0',
    provider: 'google',
    description: 'Liste les tâches Google de la liste par défaut.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        show_completed: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'LOW',
    permissions: ['personal.tasks.read'],
    health: env.GOOGLE_TASKS_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED');
    const params = new URLSearchParams({
      maxResults: String(boundedInt(input.limit, 50, 1, 100)),
      showCompleted: input.show_completed === false ? 'false' : 'true',
      showHidden: 'false',
    });
    const data = await requestJson(fetchImpl, TASKS_API + '/lists/@default/tasks?' + params.toString(), {
      accessToken,
      code: 'GOOGLE_TASKS_LIST_FAILED',
    });
    return {
      tasks: (Array.isArray(data.items) ? data.items : []).slice(0, 100).map(row => ({
        id: text(row.id, 300),
        title: text(row.title, 2000),
        notes: text(row.notes, 8000),
        status: text(row.status, 80),
        due: text(row.due, 100),
        completed: text(row.completed, 100),
        updated: text(row.updated, 100),
      })),
    };
  }, healthByToken(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED'));

  const taskMutationSchema = {
    type: 'object',
    properties: {
      task_id: { type: 'string', minLength: 1, maxLength: 300 },
      title: { type: 'string', minLength: 1, maxLength: 2000 },
      notes: { type: 'string', minLength: 0, maxLength: 8000 },
      due: { type: 'string', minLength: 1, maxLength: 80 },
      status: { type: 'string', enum: ['needsAction', 'completed'] },
    },
    additionalProperties: false,
  };

  add({
    id: 'tasks.create',
    name: 'Créer une tâche Google',
    category: 'tasks',
    version: '1.0.0',
    provider: 'google',
    description: 'Crée une tâche Google après approbation explicite.',
    input_schema: { ...taskMutationSchema, required: ['title'] },
    output_schema: emptyObjectSchema,
    risk: 'MEDIUM',
    permissions: ['personal.tasks.write'],
    approval: { required: true, scope: 'tasks.create', reason: 'TASK_MUTATION' },
    health: env.GOOGLE_TASKS_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED');
    const body = {
      title: requiredText(input.title, 'GOOGLE_TASK_TITLE_REQUIRED', 2000),
      ...(input.notes !== undefined ? { notes: text(input.notes, 8000) } : {}),
      ...(input.due ? { due: isoDate(input.due, 'GOOGLE_TASK_DUE_INVALID') } : {}),
    };
    const data = await requestJson(fetchImpl, TASKS_API + '/lists/@default/tasks', {
      method: 'POST',
      accessToken,
      body,
      code: 'GOOGLE_TASK_CREATE_FAILED',
    });
    return { id: text(data.id, 300), title: text(data.title, 2000), status: text(data.status, 80), due: text(data.due, 100) };
  }, healthByToken(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED'));

  add({
    id: 'tasks.update',
    name: 'Modifier une tâche Google',
    category: 'tasks',
    version: '1.0.0',
    provider: 'google',
    description: 'Modifie une tâche Google précise après approbation explicite.',
    input_schema: { ...taskMutationSchema, required: ['task_id'] },
    output_schema: emptyObjectSchema,
    risk: 'MEDIUM',
    permissions: ['personal.tasks.write'],
    approval: { required: true, scope: 'tasks.update', reason: 'TASK_MUTATION' },
    health: env.GOOGLE_TASKS_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED');
    const taskId = requiredText(input.task_id, 'GOOGLE_TASK_ID_REQUIRED', 300);
    const body = {};
    if (input.title !== undefined) body.title = requiredText(input.title, 'GOOGLE_TASK_TITLE_INVALID', 2000);
    if (input.notes !== undefined) body.notes = text(input.notes, 8000);
    if (input.due !== undefined) body.due = isoDate(input.due, 'GOOGLE_TASK_DUE_INVALID');
    if (input.status !== undefined) body.status = input.status;
    if (!Object.keys(body).length) throw capabilityError('GOOGLE_TASK_UPDATE_EMPTY', 400);
    const data = await requestJson(fetchImpl, TASKS_API + '/lists/@default/tasks/' + encodeURIComponent(taskId), {
      method: 'PATCH',
      accessToken,
      body,
      code: 'GOOGLE_TASK_UPDATE_FAILED',
    });
    return { id: text(data.id, 300), title: text(data.title, 2000), status: text(data.status, 80), due: text(data.due, 100) };
  }, healthByToken(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED'));

  add({
    id: 'tasks.delete',
    name: 'Supprimer une tâche Google',
    category: 'tasks',
    version: '1.0.0',
    provider: 'google',
    description: 'Supprime une tâche Google précise après approbation explicite.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string', minLength: 1, maxLength: 300 } },
      required: ['task_id'],
      additionalProperties: false,
    },
    output_schema: emptyObjectSchema,
    risk: 'HIGH',
    permissions: ['personal.tasks.write'],
    approval: { required: true, scope: 'tasks.delete', reason: 'TASK_DELETE' },
    health: env.GOOGLE_TASKS_ACCESS_TOKEN ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    const accessToken = token(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED');
    const taskId = requiredText(input.task_id, 'GOOGLE_TASK_ID_REQUIRED', 300);
    await requestJson(fetchImpl, TASKS_API + '/lists/@default/tasks/' + encodeURIComponent(taskId), {
      method: 'DELETE',
      accessToken,
      code: 'GOOGLE_TASK_DELETE_FAILED',
    });
    return { deleted: true, task_id: taskId };
  }, healthByToken(env, 'GOOGLE_TASKS_ACCESS_TOKEN', 'GOOGLE_TASKS_AUTH_REQUIRED'));

  return Object.freeze(registered);
}

export const __test = Object.freeze({ base64UrlUtf8, decodeBase64UrlUtf8, mimeMessage });
