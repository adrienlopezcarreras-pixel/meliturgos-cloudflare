import { requireValue } from '../core/contracts.js';
export function authorize(required = [], context = {}) {
  requireValue(Boolean(context.owner), 'AUTH_REQUIRED', 401);
  for (const permission of required) requireValue(context.permissions?.includes(permission), 'PERMISSION_DENIED', 403);
}
