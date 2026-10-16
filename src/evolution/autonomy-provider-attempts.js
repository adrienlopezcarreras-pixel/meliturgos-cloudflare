// Provider attempts are evidence only when every recorded adapter is a
// nonempty, distinct identity; array length alone can be spoofed by retries.
export function hasDistinctProviderAttempts(values) {
  return Array.isArray(values) && values.length >= 2 && values.length <= 64
    && values.every(value => typeof value === 'string' && value.length <= 200
      && value.trim().length > 0 && value === value.trim())
    && new Set(values).size === values.length;
}
