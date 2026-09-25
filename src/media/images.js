import { port } from '../core/contracts.js';
import {
  IMAGE_ACTIONS,
  IMAGE_RUNTIME_SCHEMA,
  ImageVisionRuntime,
  createImageAdapters,
  createImageVisionRuntime,
} from './image-vision-runtime.js';

export const methods = ["analyze", "process", "generate"];

/**
 * Canonical visual port.
 *
 * With no adapters it remains fail-closed, exactly like the historical port.
 * createImageAdapters() exposes the provider-neutral runtime with free-first
 * routing, explicit paid-call approval and provenance-bound results.
 */
export const createImages = adapters => port('media/images', methods, adapters);

export {
  IMAGE_ACTIONS,
  IMAGE_RUNTIME_SCHEMA,
  ImageVisionRuntime,
  createImageAdapters,
  createImageVisionRuntime,
};
