/**
 * Deterministic normalisation used as the hash input.
 *
 * `JSON.stringify` preserves insertion order, which depends on how each module
 * happened to build its object. Sorting keys recursively means the hash only
 * changes when the *values* change, not when the code is reordered.
 */

/** Recursively sorts object keys and drops values that cannot be serialised. */
export function canonicalize(value: unknown): unknown {
  if (value === null) return null;

  const kind = typeof value;
  if (kind === 'number') return Number.isFinite(value as number) ? value : String(value);
  if (kind === 'string' || kind === 'boolean') return value;
  if (kind === 'bigint') return String(value);
  if (kind === 'undefined' || kind === 'function' || kind === 'symbol') return undefined;

  if (Array.isArray(value)) {
    // Array order is meaningful (font list, extension list) so it is preserved.
    return value.map((entry) => {
      const normalised = canonicalize(entry);
      return normalised === undefined ? null : normalised;
    });
  }

  if (value instanceof Map) {
    const asObject: Record<string, unknown> = {};
    for (const [key, entry] of value) asObject[String(key)] = entry;
    return canonicalize(asObject);
  }

  if (value instanceof Set) {
    return canonicalize([...value]);
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const normalised = canonicalize(source[key]);
      if (normalised !== undefined) result[key] = normalised;
    }
    return result;
  }

  return String(value);
}

/** Canonical, key-sorted JSON string. This is what gets hashed. */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * Pretty JSON with sorted keys, used for Copy / Download.
 * Same ordering guarantee as the hash input so the file and the hash agree.
 */
export function prettyJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

/** Flattens nested objects into "a.b.c -> value" rows for the simple UI. */
export function flatten(
  value: unknown,
  prefix = '',
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];

  if (value === null || typeof value !== 'object') {
    return [[prefix || 'value', stringifyLeaf(value)]];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [[prefix, '[]']];
    if (value.every((entry) => entry === null || typeof entry !== 'object')) {
      return [[prefix, value.map(stringifyLeaf).join(', ') || '[]']];
    }
    value.forEach((entry, index) => rows.push(...flatten(entry, `${prefix}[${index}]`)));
    return rows;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [[prefix, '{}']];

  for (const [key, entry] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry !== null && typeof entry === 'object') rows.push(...flatten(entry, path));
    else rows.push([path, stringifyLeaf(entry)]);
  }
  return rows;
}

export function stringifyLeaf(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  // Arrays of plain values read better as a comma-separated list than as JSON.
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    if (value.every((entry) => entry === null || typeof entry !== 'object')) {
      return value.map((entry) => stringifyLeaf(entry)).join(', ');
    }
  }
  return JSON.stringify(value) ?? String(value);
}