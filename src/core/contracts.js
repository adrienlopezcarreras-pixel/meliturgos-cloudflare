/** Stable port convention: method(input={}, context={}) -> Promise<domain value>.
 * context is server constructed: {owner, permissions, requestId, signal}.
 * Unimplemented ports fail closed; they never manufacture successful results.
 */
export class DomainError extends Error {
  constructor(code, status = 501) { super(code); this.code = code; this.status = status; }
}
export function port(name, methods, adapters = {}) {
  return Object.freeze(Object.fromEntries(methods.map(method => [method, async (input = {}, context = {}) => {
    if (typeof adapters[method] !== 'function') throw new DomainError(`NOT_IMPLEMENTED:${name}.${method}`);
    return adapters[method](input, context);
  }])));
}
export function requireValue(condition, code = 'INVALID_REQUEST', status = 400) {
  if (!condition) throw new DomainError(code, status);
}
