import { port } from '../contracts.js';
export const methods = ["checkpoint", "resume", "fail"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createRecovery = adapters => port('core/lifecycle/recovery',methods,adapters);
