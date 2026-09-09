import { port } from '../core/contracts.js';
export const methods = ["queryMultiple", "compare", "score", "synthesize"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createModelCouncil = adapters => port('models/model-council',methods,adapters);
