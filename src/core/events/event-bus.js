import { port } from '../contracts.js';
export const methods = ["publish", "subscribe"];
/** TODO implement only the corresponding OpenHands ticket.
 * Port input is domain data; context={owner,permissions,requestId,signal} is trusted.
 * No storage/network side effects until a server adapter is explicitly injected.
 */
export const createEventBus = adapters => port('core/events/event-bus',methods,adapters);
