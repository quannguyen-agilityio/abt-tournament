/**
 * Flatten a nested messages object into dot-separated keys.
 * Returns `{ keys, empty }`: every leaf key and the leaf keys whose value is blank.
 */
export function flattenKeys(messages, prefix = '') {
  const keys = [];
  const empty = [];
  for (const [name, value] of Object.entries(messages)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value !== null && typeof value === 'object') {
      const nested = flattenKeys(value, key);
      keys.push(...nested.keys);
      empty.push(...nested.empty);
    } else {
      keys.push(key);
      if (typeof value === 'string' && value.trim() === '') empty.push(key);
    }
  }
  return { keys, empty };
}

/** Compare two key lists; returns the keys each side is missing, sorted. */
export function diffKeys(viKeys, enKeys) {
  const vi = new Set(viKeys);
  const en = new Set(enKeys);
  return {
    missingInEn: [...vi].filter((k) => !en.has(k)).sort(),
    missingInVi: [...en].filter((k) => !vi.has(k)).sort(),
  };
}
