import { describe, expect, it } from 'vitest';
import { diffKeys, flattenKeys } from './message-keys.mjs';

describe('flattenKeys', () => {
  it('flattens nested objects into dotted keys', () => {
    expect(flattenKeys({ A: { b: 'x', c: { d: 'y' } }, e: 'z' }).keys).toEqual(['A.b', 'A.c.d', 'e']);
  });

  it('reports blank values', () => {
    expect(flattenKeys({ A: { b: '', c: '  ', d: 'ok' } }).empty).toEqual(['A.b', 'A.c']);
  });
});

describe('diffKeys', () => {
  it('returns nothing when the sets match regardless of order', () => {
    expect(diffKeys(['a', 'b'], ['b', 'a'])).toEqual({ missingInEn: [], missingInVi: [] });
  });

  it('lists keys missing on each side', () => {
    expect(diffKeys(['a', 'b'], ['b', 'c'])).toEqual({ missingInEn: ['a'], missingInVi: ['c'] });
  });
});
