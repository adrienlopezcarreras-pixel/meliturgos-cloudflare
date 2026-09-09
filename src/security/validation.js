import { requireValue } from '../core/contracts.js';
/** Deliberately bounded JSON Schema subset; unsupported keywords fail closed. */
export function validate(value, schema) {
  requireValue(schema && typeof schema === 'object', 'SCHEMA_REQUIRED');
  const supported = ['type','properties','required','additionalProperties','items','enum','minLength','maxLength','minimum','maximum','description'];
  requireValue(Object.keys(schema).every(k => supported.includes(k)), 'UNSUPPORTED_SCHEMA');
  if (schema.enum) requireValue(schema.enum.includes(value), 'INVALID_ENUM');
  const types = {object: v => v !== null && typeof v === 'object' && !Array.isArray(v), array: Array.isArray, string: v => typeof v === 'string', number: v => typeof v === 'number' && Number.isFinite(v), integer: Number.isInteger, boolean: v => typeof v === 'boolean', null: v => v === null};
  requireValue(types[schema.type]?.(value), 'INVALID_TYPE');
  if (schema.type === 'object') {
    for (const k of schema.required || []) requireValue(Object.hasOwn(value,k), 'MISSING_FIELD');
    for (const k of Object.keys(value)) {
      if (Object.hasOwn(schema.properties || {},k)) validate(value[k],schema.properties[k]);
      else requireValue(schema.additionalProperties === true, 'UNKNOWN_FIELD');
    }
  }
  if (schema.type === 'array') { requireValue(Boolean(schema.items), 'ITEM_SCHEMA_REQUIRED'); for (const v of value) validate(v,schema.items); }
  if (typeof value === 'string') requireValue(value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? 12000), 'INVALID_LENGTH');
  if (typeof value === 'number') requireValue(value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity), 'INVALID_RANGE');
  return value;
}
