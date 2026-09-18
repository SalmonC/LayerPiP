/** Preserve intentionally empty shortcuts; malformed persisted values fall back in memory. */
export function shortcutKeys(value: unknown, fallback: unknown): string[] {
  const valid = (keys: unknown): keys is string[] =>
    Array.isArray(keys) &&
    keys.every((key) => typeof key === 'string' && key.length > 0)
  return valid(value) ? value : valid(fallback) ? [...fallback] : []
}
