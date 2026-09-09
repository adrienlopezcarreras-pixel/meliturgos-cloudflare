import { port } from '../core/contracts.js';
export const methods = ["transcribe", "synthesize"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createAudio = adapters => port('media/audio',methods,adapters);
