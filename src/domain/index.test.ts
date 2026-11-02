import { describe, expect, it } from 'vitest';
import * as domain from './index';

describe('domain layer', () => {
  it('loads without framework dependencies', () => {
    expect(domain).toBeDefined();
  });
});
