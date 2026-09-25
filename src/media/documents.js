import { port } from '../core/contracts.js';
export const methods = ["extract", "index"];
/** Canonical document port. Concrete bounded extraction/indexing lives in document-processor.js. */
export const createDocuments = adapters => port('media/documents',methods,adapters);

export { DOCUMENT_KINDS, DOCUMENT_LIMITS, createDocumentProcessor, detectDocumentKind } from './document-processor.js';
