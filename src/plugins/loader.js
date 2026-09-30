import { port } from '../core/contracts.js';
export const methods = ["installCandidate", "load", "execute", "health", "disable", "rollback"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createLoader = adapters => port('plugins/loader',methods,adapters);
