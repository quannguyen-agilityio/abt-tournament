import { describe, expect, it } from 'vitest';
import { duplicateSlugs, nameKey, slugify } from './names';

describe('nameKey', () => {
  it('ignores case, spacing and unicode form', () => {
    expect(nameKey('  AlPHA   one ')).toBe('alpha one');
    expect(nameKey('Đức'.normalize('NFD'))).toBe(nameKey('đức'));
  });
});

describe('slugify', () => {
  it('strips accents and maps đ to d', () => {
    expect(slugify('Nguyễn Đức Thắng')).toBe('nguyen-duc-thang');
  });

  it('gives slugs the database accepts', () => {
    for (const name of ['Alpha  One', ' Bravo-Two ', "O'Neil Three", 'Đ']) {
      expect(slugify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('reports duplicates', () => {
    expect(duplicateSlugs(['Alpha One', 'alpha one', 'Bravo'])).toEqual(['alpha-one (Alpha One, alpha one)']);
    expect(duplicateSlugs(['Alpha One', 'Bravo'])).toEqual([]);
  });
});
