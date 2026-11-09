import { describe, expect, it } from 'vitest';
import * as domain from './index';

describe('domain layer', () => {
  it('loads without framework dependencies', () => {
    expect(domain).toBeDefined();
  });

  it('exports the live scoring engine', () => {
    expect(domain.replay).toBeTypeOf('function');
    expect(domain.tryReplay).toBeTypeOf('function');
    expect(domain.legChange).toBeTypeOf('function');
  });
});
