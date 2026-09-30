import { port } from '../core/contracts.js';
import {
  AUDIO_ACTIONS,
  AUDIO_RUNTIME_SCHEMA,
  AudioRuntime,
  createAudioAdapters,
  createAudioRuntime,
} from './audio-runtime.js';

export const methods = ["transcribe", "synthesize", "analyze", "generate"];

/**
 * Canonical audio/music port.
 *
 * With no adapters it remains fail-closed.
 * createAudioAdapters() exposes the provider-neutral runtime with free-first
 * routing, explicit paid approval and provenance-bound outputs.
 */
export const createAudio = adapters => port('media/audio', methods, adapters);

export {
  AUDIO_ACTIONS,
  AUDIO_RUNTIME_SCHEMA,
  AudioRuntime,
  createAudioAdapters,
  createAudioRuntime,
};
