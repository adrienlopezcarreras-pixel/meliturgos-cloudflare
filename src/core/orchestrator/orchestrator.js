import { port } from '../contracts.js';
export const methods = ["plan", "execute", "resume", "cancel"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createOrchestrator = adapters => port('core/orchestrator/orchestrator',methods,adapters);
