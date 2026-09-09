import { port } from '../core/contracts.js';
export const methods = ["analyze", "process"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createVideo = adapters => port('media/video',methods,adapters);
