import { port } from '../core/contracts.js';
import {
  VIDEO_ACTIONS,
  VIDEO_RUNTIME_SCHEMA,
  VideoRuntime,
  createVideoAdapters,
  createVideoRuntime,
} from './video-runtime.js';

export const methods = ["analyze", "process", "generate"];

/**
 * Canonical video port.
 *
 * With no adapters it remains fail-closed.
 * createVideoAdapters() exposes the provider-neutral runtime with free-first
 * routing, explicit paid approval and provenance-bound outputs.
 */
export const createVideo = adapters => port('media/video', methods, adapters);

export {
  VIDEO_ACTIONS,
  VIDEO_RUNTIME_SCHEMA,
  VideoRuntime,
  createVideoAdapters,
  createVideoRuntime,
};
