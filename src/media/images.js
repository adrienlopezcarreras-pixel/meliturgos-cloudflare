import { port } from '../core/contracts.js';
export const methods = ["analyze", "process", "generate"];
/** Canonical visual port. Generation remains fail-closed until a real authorized provider is injected. */
export const createImages = adapters => port('media/images',methods,adapters);
