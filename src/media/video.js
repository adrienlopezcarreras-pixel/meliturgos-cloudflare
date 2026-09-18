import { port } from '../core/contracts.js';
export const methods = ["analyze", "process", "generate"];
/** Canonical video port. Generation remains fail-closed until a real authorized provider is injected. */
export const createVideo = adapters => port('media/video',methods,adapters);
