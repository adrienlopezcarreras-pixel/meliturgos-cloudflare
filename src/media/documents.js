import { port } from '../core/contracts.js';
import {
  DocumentRuntime,
  createDocumentAdapters,
  createDocumentRuntime,
  detectDocumentType,
  chunkDocumentText,
} from './document-runtime.js';

export const methods = ["extract", "index"];

/**
 * Stable media/documents port.
 *
 * Existing fail-closed behavior is preserved when adapters are omitted.
 * createDocumentAdapters() provides the bounded built-in runtime and explicit
 * PDF/DOCX parser injection without adding storage or network side effects.
 */
export const createDocuments = adapters => port('media/documents', methods, adapters);

export {
  DocumentRuntime,
  createDocumentAdapters,
  createDocumentRuntime,
  detectDocumentType,
  chunkDocumentText,
};
