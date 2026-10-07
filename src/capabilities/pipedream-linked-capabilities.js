const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX_LIST = 50;
const objectOutput = { type: 'object', additionalProperties: true };

function capError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function text(value, code, max = 4000, { required = true } = {}) {
  const normalized = String(value ?? '').trim();
  if (required && !normalized) throw capError(code, 400);
  if (normalized.length > max) throw capError(code, 400);
  return normalized;
}

function limit(value, fallback = 20) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(1, Math.min(MAX_LIST, n)) : fallback;
}

function encodeId(value, code = 'MICROSOFT_ID_INVALID') {
  const id = text(value, code, 500);
  if (id.includes('/') || id.includes('..')) throw capError(code, 400);
  return encodeURIComponent(id);
}

function safeEmail(value) {
  const email = text(value, 'OUTLOOK_EMAIL_INVALID', 320);
  if (/[\r\n]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw capError('OUTLOOK_EMAIL_INVALID', 400);
  return email;
}

function safePath(value) {
  const raw = text(value, 'ONEDRIVE_PATH_INVALID', 1200).replaceAll('\\', '/');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..' || /[\r\n]/.test(part))) {
    throw capError('ONEDRIVE_PATH_INVALID', 400);
  }
  return parts.map(part => encodeURIComponent(part)).join('/');
}

function pdHealth(pipedreamRuntime, app, url, { protectedAction = false } = {}) {
  return async () => {
    if (!pipedreamRuntime || typeof pipedreamRuntime.proxy !== 'function') {
      return { status: 'UNAVAILABLE', reason: 'PIPEDREAM_RUNTIME_UNAVAILABLE' };
    }
    try {
      await pipedreamRuntime.proxy({ app, url, method: 'GET' });
      return { status: protectedAction ? 'PROTECTED' : 'HEALTHY' };
    } catch (error) {
      return {
        status: 'UNAVAILABLE',
        reason: String(error?.code || error?.message || 'PIPEDREAM_LINKED_ACCOUNT_UNAVAILABLE').slice(0, 180),
      };
    }
  };
}

async function proxy(pipedreamRuntime, context, app, url, options = {}) {
  if (!pipedreamRuntime || typeof pipedreamRuntime.proxy !== 'function') throw capError('PIPEDREAM_RUNTIME_UNAVAILABLE', 503);
  const result = await pipedreamRuntime.proxy({
    owner: context?.owner,
    app,
    url,
    method: options.method || 'GET',
    body: options.body,
    headers: options.headers || {},
    signal: context?.signal,
  });
  return result?.body || {};
}

function rows(body) {
  return Array.isArray(body?.value) ? body.value : [];
}

function register(bus, record, execute) {
  bus.discover({
    version: '1.0.0',
    provider: 'pipedream',
    output_schema: objectOutput,
    health: 'DEGRADED',
    enabled: true,
    ...record,
  }, execute);
}

export function registerPipedreamLinkedCapabilities(bus, { pipedreamRuntime = null } = {}) {
  if (!bus || typeof bus.discover !== 'function') throw new TypeError('CAPABILITY_BUS_REQUIRED');
  const ids = [];

  register(bus, {
    id: 'mail.messages.search',
    name: 'Outlook / MSN message search',
    category: 'communication',
    description: 'Reads a bounded Outlook/MSN message list through the authenticated Pipedream Microsoft account.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 500 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.mail.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_outlook', GRAPH + '/me/messages?$top=1&$select=id'),
  }, async (input, context) => {
    const params = new URLSearchParams({
      '$top': String(limit(input.limit)),
      '$select': 'id,subject,from,receivedDateTime,isRead,bodyPreview',
      '$orderby': 'receivedDateTime desc',
    });
    const q = input.query ? text(input.query, 'OUTLOOK_QUERY_INVALID', 500) : '';
    if (q) params.set('$search', '"' + q.replaceAll('"', '') + '"');
    const body = await proxy(
      pipedreamRuntime,
      context,
      'microsoft_outlook',
      GRAPH + '/me/messages?' + params.toString(),
      q ? { headers: { ConsistencyLevel: 'eventual' } } : {},
    );
    const messages = rows(body).slice(0, limit(input.limit));
    return { provider: 'pipedream', service: 'outlook', messages, count: messages.length };
  });
  ids.push('mail.messages.search');

  register(bus, {
    id: 'mail.messages.read',
    name: 'Outlook / MSN message read',
    category: 'communication',
    description: 'Reads one Outlook/MSN message by identifier through Pipedream.',
    input_schema: {
      type: 'object',
      properties: { message_id: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['message_id'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.mail.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_outlook', GRAPH + '/me/messages?$top=1&$select=id'),
  }, async (input, context) => {
    const id = encodeId(input.message_id, 'OUTLOOK_MESSAGE_ID_INVALID');
    const body = await proxy(
      pipedreamRuntime,
      context,
      'microsoft_outlook',
      GRAPH + '/me/messages/' + id + '?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,body',
    );
    return { provider: 'pipedream', service: 'outlook', message: body };
  });
  ids.push('mail.messages.read');

  register(bus, {
    id: 'mail.messages.send',
    name: 'Outlook / MSN send message',
    category: 'communication',
    description: 'Sends one bounded plain-text Outlook/MSN message after explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 3, maxLength: 320 } },
        subject: { type: 'string', minLength: 1, maxLength: 998 },
        body: { type: 'string', minLength: 1, maxLength: 100000 },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: ['microsoft.mail.send'],
    approval: { required: true, scope: 'mail.messages.send', reason: 'OUTLOOK_SEND_MUTATION' },
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_outlook', GRAPH + '/me/messages?$top=1&$select=id', { protectedAction: true }),
  }, async (input, context) => {
    const subject = text(input.subject, 'OUTLOOK_SUBJECT_INVALID', 998);
    if (/[\r\n]/.test(subject)) throw capError('OUTLOOK_SUBJECT_INVALID', 400);
    const bodyText = text(input.body, 'OUTLOOK_BODY_INVALID', 100000);
    const recipients = [...new Set(input.to.map(safeEmail))].map(address => ({ emailAddress: { address } }));
    await proxy(pipedreamRuntime, context, 'microsoft_outlook', GRAPH + '/me/sendMail', {
      method: 'POST',
      body: {
        message: {
          subject,
          body: { contentType: 'Text', content: bodyText },
          toRecipients: recipients,
        },
        saveToSentItems: true,
      },
    });
    return { provider: 'pipedream', service: 'outlook', accepted: true };
  });
  ids.push('mail.messages.send');

  register(bus, {
    id: 'mail.messages.move',
    name: 'Outlook / MSN move message',
    category: 'communication',
    description: 'Moves one Outlook/MSN message after explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: {
        message_id: { type: 'string', minLength: 1, maxLength: 500 },
        destination_id: { type: 'string', minLength: 1, maxLength: 500 },
      },
      required: ['message_id', 'destination_id'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: ['microsoft.mail.move'],
    approval: { required: true, scope: 'mail.messages.move', reason: 'OUTLOOK_MOVE_MUTATION' },
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_outlook', GRAPH + '/me/messages?$top=1&$select=id', { protectedAction: true }),
  }, async (input, context) => {
    const id = encodeId(input.message_id, 'OUTLOOK_MESSAGE_ID_INVALID');
    const destinationId = text(input.destination_id, 'OUTLOOK_DESTINATION_ID_INVALID', 500);
    const body = await proxy(pipedreamRuntime, context, 'microsoft_outlook', GRAPH + '/me/messages/' + id + '/move', {
      method: 'POST',
      body: { destinationId },
    });
    return { provider: 'pipedream', service: 'outlook', accepted: true, message_id: String(body?.id || input.message_id) };
  });
  ids.push('mail.messages.move');

  register(bus, {
    id: 'files.list',
    name: 'OneDrive files list',
    category: 'files',
    description: 'Lists a bounded OneDrive folder through the linked Pipedream Microsoft account.',
    input_schema: {
      type: 'object',
      properties: {
        folder_id: { type: 'string', maxLength: 500 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.files.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_onedrive', GRAPH + '/me/drive/root?$select=id'),
  }, async (input, context) => {
    const target = input.folder_id
      ? GRAPH + '/me/drive/items/' + encodeId(input.folder_id, 'ONEDRIVE_FOLDER_ID_INVALID') + '/children'
      : GRAPH + '/me/drive/root/children';
    const params = new URLSearchParams({
      '$top': String(limit(input.limit)),
      '$select': 'id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference',
    });
    const body = await proxy(pipedreamRuntime, context, 'microsoft_onedrive', target + '?' + params.toString());
    const files = rows(body).slice(0, limit(input.limit));
    return { provider: 'pipedream', service: 'onedrive', files, count: files.length };
  });
  ids.push('files.list');

  register(bus, {
    id: 'files.search',
    name: 'OneDrive files search',
    category: 'files',
    description: 'Searches OneDrive with a bounded query through Pipedream.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      required: ['query'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.files.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_onedrive', GRAPH + '/me/drive/root?$select=id'),
  }, async (input, context) => {
    const q = text(input.query, 'ONEDRIVE_QUERY_INVALID', 300).replaceAll("'", "''");
    const url = GRAPH + "/me/drive/root/search(q='" + encodeURIComponent(q) + "')?$top=" + limit(input.limit);
    const body = await proxy(pipedreamRuntime, context, 'microsoft_onedrive', url);
    const files = rows(body).slice(0, limit(input.limit));
    return { provider: 'pipedream', service: 'onedrive', query: input.query, files, count: files.length };
  });
  ids.push('files.search');

  register(bus, {
    id: 'files.read',
    name: 'OneDrive file read',
    category: 'files',
    description: 'Reads OneDrive file metadata and, when requested, bounded text content through Pipedream.',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', minLength: 1, maxLength: 500 },
        include_content: { type: 'boolean' },
      },
      required: ['file_id'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.files.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_onedrive', GRAPH + '/me/drive/root?$select=id'),
  }, async (input, context) => {
    const id = encodeId(input.file_id, 'ONEDRIVE_FILE_ID_INVALID');
    const metadata = await proxy(
      pipedreamRuntime,
      context,
      'microsoft_onedrive',
      GRAPH + '/me/drive/items/' + id + '?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference',
    );
    let content = null;
    if (input.include_content === true && metadata?.file) {
      const raw = await proxy(pipedreamRuntime, context, 'microsoft_onedrive', GRAPH + '/me/drive/items/' + id + '/content');
      content = typeof raw?.text === 'string' ? raw.text.slice(0, 120000) : raw;
    }
    return { provider: 'pipedream', service: 'onedrive', metadata, content };
  });
  ids.push('files.read');

  register(bus, {
    id: 'files.write',
    name: 'OneDrive text file write',
    category: 'files',
    description: 'Creates or replaces one bounded text file in OneDrive after explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 1200 },
        content: { type: 'string', maxLength: 120000 },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: ['microsoft.files.write'],
    approval: { required: true, scope: 'files.write', reason: 'ONEDRIVE_FILE_WRITE' },
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_onedrive', GRAPH + '/me/drive/root?$select=id', { protectedAction: true }),
  }, async (input, context) => {
    const path = safePath(input.path);
    const content = String(input.content ?? '');
    if (content.length > 120000) throw capError('ONEDRIVE_CONTENT_INVALID', 400);
    const body = await proxy(pipedreamRuntime, context, 'microsoft_onedrive', GRAPH + '/me/drive/root:/' + path + ':/content', {
      method: 'PUT',
      body: content,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
    return { provider: 'pipedream', service: 'onedrive', accepted: true, item: body };
  });
  ids.push('files.write');

  register(bus, {
    id: 'files.delete',
    name: 'OneDrive file delete',
    category: 'files',
    description: 'Deletes one OneDrive item after explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: { file_id: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['file_id'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: ['microsoft.files.delete'],
    approval: { required: true, scope: 'files.delete', reason: 'ONEDRIVE_FILE_DELETE' },
    healthcheck: pdHealth(pipedreamRuntime, 'microsoft_onedrive', GRAPH + '/me/drive/root?$select=id', { protectedAction: true }),
  }, async (input, context) => {
    const id = encodeId(input.file_id, 'ONEDRIVE_FILE_ID_INVALID');
    await proxy(pipedreamRuntime, context, 'microsoft_onedrive', GRAPH + '/me/drive/items/' + id, { method: 'DELETE' });
    return { provider: 'pipedream', service: 'onedrive', accepted: true, file_id: input.file_id };
  });
  ids.push('files.delete');

  register(bus, {
    id: 'drive.files.list',
    name: 'Google Drive files list',
    category: 'files',
    description: 'Lists a bounded Google Drive file set through the linked Pipedream Google Drive account.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_LIST } },
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['google.drive.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'google_drive', 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)'),
  }, async (input, context) => {
    const params = new URLSearchParams({
      pageSize: String(limit(input.limit)),
      fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink,parents)',
      q: 'trashed=false',
    });
    const body = await proxy(pipedreamRuntime, context, 'google_drive', 'https://www.googleapis.com/drive/v3/files?' + params.toString());
    const files = Array.isArray(body?.files) ? body.files.slice(0, limit(input.limit)) : [];
    return { provider: 'pipedream', service: 'google-drive', files, count: files.length };
  });
  ids.push('drive.files.list');

  register(bus, {
    id: 'drive.files.search',
    name: 'Google Drive files search',
    category: 'files',
    description: 'Searches Google Drive by bounded file-name query through Pipedream.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      required: ['query'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['google.drive.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'google_drive', 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)'),
  }, async (input, context) => {
    const q = text(input.query, 'GOOGLE_DRIVE_QUERY_INVALID', 300).replaceAll("'", "\\'");
    const params = new URLSearchParams({
      pageSize: String(limit(input.limit)),
      fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink,parents)',
      q: "trashed=false and name contains '" + q + "'",
    });
    const body = await proxy(pipedreamRuntime, context, 'google_drive', 'https://www.googleapis.com/drive/v3/files?' + params.toString());
    const files = Array.isArray(body?.files) ? body.files.slice(0, limit(input.limit)) : [];
    return { provider: 'pipedream', service: 'google-drive', query: input.query, files, count: files.length };
  });
  ids.push('drive.files.search');

  register(bus, {
    id: 'drive.files.read',
    name: 'Google Drive file read',
    category: 'files',
    description: 'Reads Google Drive metadata and optionally bounded text content through Pipedream.',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', minLength: 1, maxLength: 500 },
        include_content: { type: 'boolean' },
      },
      required: ['file_id'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['google.drive.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'google_drive', 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)'),
  }, async (input, context) => {
    const id = encodeId(input.file_id, 'GOOGLE_DRIVE_FILE_ID_INVALID');
    const metadata = await proxy(
      pipedreamRuntime,
      context,
      'google_drive',
      'https://www.googleapis.com/drive/v3/files/' + id + '?fields=id,name,mimeType,modifiedTime,size,webViewLink,parents',
    );
    let content = null;
    if (input.include_content === true && !String(metadata?.mimeType || '').startsWith('application/vnd.google-apps.')) {
      const raw = await proxy(pipedreamRuntime, context, 'google_drive', 'https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
      content = typeof raw?.text === 'string' ? raw.text.slice(0, 120000) : raw;
    }
    return { provider: 'pipedream', service: 'google-drive', metadata, content };
  });
  ids.push('drive.files.read');

  register(bus, {
    id: 'drive.files.create',
    name: 'Google Drive text file create',
    category: 'files',
    description: 'Creates one bounded text file in Google Drive after explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 300 },
        content: { type: 'string', maxLength: 120000 },
        parent_id: { type: 'string', maxLength: 500 },
      },
      required: ['name', 'content'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: ['google.drive.write'],
    approval: { required: true, scope: 'drive.files.create', reason: 'GOOGLE_DRIVE_FILE_CREATE' },
    healthcheck: pdHealth(pipedreamRuntime, 'google_drive', 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)', { protectedAction: true }),
  }, async (input, context) => {
    const name = text(input.name, 'GOOGLE_DRIVE_NAME_INVALID', 300);
    if (/[\r\n]/.test(name)) throw capError('GOOGLE_DRIVE_NAME_INVALID', 400);
    const content = String(input.content ?? '');
    if (content.length > 120000) throw capError('GOOGLE_DRIVE_CONTENT_INVALID', 400);
    const metadata = { name, mimeType: 'text/plain' };
    if (input.parent_id) metadata.parents = [text(input.parent_id, 'GOOGLE_DRIVE_PARENT_ID_INVALID', 500)];
    const created = await proxy(pipedreamRuntime, context, 'google_drive', 'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,webViewLink', {
      method: 'POST',
      body: metadata,
    });
    const id = encodeId(created?.id, 'GOOGLE_DRIVE_CREATE_ID_MISSING');
    const uploaded = await proxy(pipedreamRuntime, context, 'google_drive', 'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media&fields=id,name,mimeType,webViewLink', {
      method: 'PATCH',
      body: content,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
    return { provider: 'pipedream', service: 'google-drive', accepted: true, file: uploaded?.id ? uploaded : created };
  });
  ids.push('drive.files.create');

  register(bus, {
    id: 'drive.files.delete',
    name: 'Google Drive file delete',
    category: 'files',
    description: 'Deletes one Google Drive file after explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: { file_id: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['file_id'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: ['google.drive.delete'],
    approval: { required: true, scope: 'drive.files.delete', reason: 'GOOGLE_DRIVE_FILE_DELETE' },
    healthcheck: pdHealth(pipedreamRuntime, 'google_drive', 'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)', { protectedAction: true }),
  }, async (input, context) => {
    const id = encodeId(input.file_id, 'GOOGLE_DRIVE_FILE_ID_INVALID');
    await proxy(pipedreamRuntime, context, 'google_drive', 'https://www.googleapis.com/drive/v3/files/' + id, { method: 'DELETE' });
    return { provider: 'pipedream', service: 'google-drive', accepted: true, file_id: input.file_id };
  });
  ids.push('drive.files.delete');

  register(bus, {
    id: 'sites.list',
    name: 'SharePoint followed sites list',
    category: 'files',
    description: 'Lists the owner followed SharePoint sites through the linked Pipedream SharePoint account.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_LIST } },
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.sites.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'sharepoint', GRAPH + '/me/followedSites?$top=1&$select=id,name'),
  }, async (input, context) => {
    const body = await proxy(pipedreamRuntime, context, 'sharepoint', GRAPH + '/me/followedSites?$top=' + limit(input.limit));
    const sites = rows(body).slice(0, limit(input.limit));
    return { provider: 'pipedream', service: 'sharepoint', sites, count: sites.length };
  });
  ids.push('sites.list');

  register(bus, {
    id: 'sites.search',
    name: 'SharePoint sites search',
    category: 'files',
    description: 'Searches SharePoint sites through the linked Pipedream SharePoint account.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      required: ['query'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.sites.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'sharepoint', GRAPH + '/sites?search=mel&$top=1&$select=id,name'),
  }, async (input, context) => {
    const q = text(input.query, 'SHAREPOINT_QUERY_INVALID', 300);
    const params = new URLSearchParams({ search: q, '$top': String(limit(input.limit)) });
    const body = await proxy(pipedreamRuntime, context, 'sharepoint', GRAPH + '/sites?' + params.toString());
    const sites = rows(body).slice(0, limit(input.limit));
    return { provider: 'pipedream', service: 'sharepoint', query: q, sites, count: sites.length };
  });
  ids.push('sites.search');

  register(bus, {
    id: 'sites.read',
    name: 'SharePoint site read',
    category: 'files',
    description: 'Reads one SharePoint site by identifier through Pipedream.',
    input_schema: {
      type: 'object',
      properties: { site_id: { type: 'string', minLength: 1, maxLength: 500 } },
      required: ['site_id'],
      additionalProperties: false,
    },
    risk: 'LOW',
    permissions: ['microsoft.sites.read'],
    healthcheck: pdHealth(pipedreamRuntime, 'sharepoint', GRAPH + '/sites/root?$select=id,name'),
  }, async (input, context) => {
    const id = encodeId(input.site_id, 'SHAREPOINT_SITE_ID_INVALID');
    const site = await proxy(pipedreamRuntime, context, 'sharepoint', GRAPH + '/sites/' + id);
    return { provider: 'pipedream', service: 'sharepoint', site };
  });
  ids.push('sites.read');

  register(bus, {
    id: 'sites.write',
    name: 'SharePoint text file write',
    category: 'files',
    description: 'Creates or replaces one bounded text file in a SharePoint site root drive after explicit owner approval.',
    input_schema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', minLength: 1, maxLength: 500 },
        path: { type: 'string', minLength: 1, maxLength: 1200 },
        content: { type: 'string', maxLength: 120000 },
      },
      required: ['site_id', 'path', 'content'],
      additionalProperties: false,
    },
    risk: 'HIGH',
    permissions: ['microsoft.sites.write'],
    approval: { required: true, scope: 'sites.write', reason: 'SHAREPOINT_FILE_WRITE' },
    healthcheck: pdHealth(pipedreamRuntime, 'sharepoint', GRAPH + '/sites/root?$select=id,name', { protectedAction: true }),
  }, async (input, context) => {
    const siteId = encodeId(input.site_id, 'SHAREPOINT_SITE_ID_INVALID');
    const path = safePath(input.path);
    const content = String(input.content ?? '');
    if (content.length > 120000) throw capError('SHAREPOINT_CONTENT_INVALID', 400);
    const item = await proxy(pipedreamRuntime, context, 'sharepoint', GRAPH + '/sites/' + siteId + '/drive/root:/' + path + ':/content', {
      method: 'PUT',
      body: content,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
    return { provider: 'pipedream', service: 'sharepoint', accepted: true, item };
  });
  ids.push('sites.write');

  return ids;
}
