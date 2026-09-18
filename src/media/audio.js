import { port } from '../core/contracts.js';
export const methods = ["transcribe", "synthesize", "analyze", "generate"];
/** Canonical audio/music port. Analysis and generation remain fail-closed until a real authorized provider is injected. */
export const createAudio = adapters => port('media/audio',methods,adapters);
