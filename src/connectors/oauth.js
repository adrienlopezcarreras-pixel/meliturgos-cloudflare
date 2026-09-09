import { port } from '../core/contracts.js';
export const methods = ["begin", "callback", "refresh", "revoke"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createOauth = adapters => port('connectors/oauth',methods,adapters);
