import { Connector } from './sdk.js';

export const definition = Object.freeze({
  id: 'generic-imap-smtp',
  provider: 'generic-mail',
  auth_type: 'IMAP_SMTP',
  probe: null,
  secret_references: [
    'MAIL_IMAP_HOST',
    'MAIL_IMAP_PORT',
    'MAIL_SMTP_HOST',
    'MAIL_SMTP_PORT',
    'MAIL_USERNAME',
    'MAIL_PASSWORD_OR_APP_PASSWORD',
  ],
  capabilities: [
    'mail.messages.search',
    'mail.messages.read',
    'mail.messages.move',
    'mail.messages.send',
  ],
  metadata: {
    purpose: 'Direct mailbox backend for Roundcube and other standards-based providers',
    transport: ['IMAP','SMTP'],
    tls_required: true,
    status: 'UNCONFIGURED',
  },
});

export const createConnector = options => new Connector(definition, options);
