import { DomainError, requireValue } from '../core/contracts.js';
import { createDocumentProcessor } from '../media/document-processor.js';

async function loadDocumentAsset(env, id) {
  requireValue(env.DB && typeof env.DB.prepare === 'function', 'DOCUMENT_DB_REQUIRED', 503);
  requireValue(env.MEDIA_BUCKET && typeof env.MEDIA_BUCKET.get === 'function', 'DOCUMENT_BUCKET_REQUIRED', 503);
  const row = await env.DB.prepare(`SELECT id,type,mime_type,filename,size,r2_key
    FROM media_assets WHERE id=?`).bind(String(id)).first();
  requireValue(row, 'MEDIA_NOT_FOUND', 404);
  requireValue(String(row.type || '').toUpperCase() === 'DOCUMENT', 'MEDIA_NOT_DOCUMENT', 409);
  requireValue(String(row.r2_key || '').trim(), 'MEDIA_OBJECT_KEY_MISSING', 500);
  const object = await env.MEDIA_BUCKET.get(row.r2_key);
  requireValue(object, 'MEDIA_OBJECT_NOT_FOUND', 404);
  requireValue(typeof object.arrayBuffer === 'function', 'MEDIA_OBJECT_BODY_UNREADABLE', 500);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (Number.isFinite(Number(row.size))) requireValue(bytes.length === Number(row.size), 'MEDIA_OBJECT_SIZE_MISMATCH', 500);
  return {
    bytes,
    filename: row.filename || 'document',
    mime_type: row.mime_type || 'application/octet-stream',
  };
}

const objectSchema = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

export function registerDocumentCapabilities(bus, env = {}) {
  const extractors = env.MEL_DOCUMENT_EXTRACTORS && typeof env.MEL_DOCUMENT_EXTRACTORS === 'object'
    ? env.MEL_DOCUMENT_EXTRACTORS
    : {};
  const processor = createDocumentProcessor({ extractors });
  const configured = Boolean(env.DB && env.MEDIA_BUCKET);
  const binaryStatus = kind => {
    const adapter = extractors[kind] ?? extractors[kind.toLowerCase()];
    return typeof adapter === 'function' || typeof adapter?.extract === 'function';
  };

  bus.discover({
    id: 'documents.status',
    name: 'État traitement documents',
    category: 'documents',
    version: '1.0.0',
    provider: 'core',
    description: 'Expose les formats intégrés et la disponibilité des extractors binaires sans lire de document.',
    input_schema: objectSchema(),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: configured ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async () => ({
    ok: true,
    persistent_media: configured,
    built_in: ['TEXT', 'MARKDOWN', 'CSV', 'JSON', 'HTML'],
    binary_extractors: {
      PDF: binaryStatus('PDF'),
      DOCX: binaryStatus('DOCX'),
      DOC: binaryStatus('DOC'),
    },
  }));

  const extractionInput = {
    id: { type: 'string', minLength: 1, maxLength: 200 },
    max_bytes: { type: 'integer', minimum: 1, maximum: 10000000 },
    max_chars: { type: 'integer', minimum: 1, maximum: 2000000 },
    max_pages: { type: 'integer', minimum: 1, maximum: 1000 },
  };

  bus.discover({
    id: 'documents.extract',
    name: 'Extraire un document',
    category: 'documents',
    version: '1.0.0',
    provider: 'core',
    description: 'Relit un asset DOCUMENT depuis R2, vérifie type/signature/limites et extrait un texte vérifiable.',
    input_schema: objectSchema(extractionInput, ['id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: configured ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    if (!configured) throw new DomainError('DOCUMENT_RUNTIME_UNAVAILABLE', 503);
    const asset = await loadDocumentAsset(env, input.id);
    return processor.extract({ ...asset, ...input, id: undefined });
  });

  bus.discover({
    id: 'documents.index',
    name: 'Indexer un document',
    category: 'documents',
    version: '1.0.0',
    provider: 'core',
    description: 'Produit des chunks déterministes bornés à partir du même pipeline d’extraction validé.',
    input_schema: objectSchema({
      ...extractionInput,
      chunk_chars: { type: 'integer', minimum: 1, maximum: 12000 },
    }, ['id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: configured ? 'HEALTHY' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    if (!configured) throw new DomainError('DOCUMENT_RUNTIME_UNAVAILABLE', 503);
    const asset = await loadDocumentAsset(env, input.id);
    return processor.index({ ...asset, ...input, id: undefined });
  });

  return processor;
}
