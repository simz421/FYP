export function ensureArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  // Some endpoints return { data: [...] } or { items: [...] }
  if (Array.isArray(value.data)) return value.data as T[];
  if (Array.isArray(value.items)) return value.items as T[];
  return [];
}
