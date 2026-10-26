import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { parseThemeTokens } from './theme-tokens';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const tokens = parseThemeTokens(css);

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('theme tokens', () => {
  it('uses the same dark values for the explicit and the system dark theme', () => {
    expect(tokens.darkSystem).toEqual(tokens.dark);
  });
});

// All of these render as normal-size text, so they need 4.5:1 (WCAG 1.4.3).
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['primary', 'brand-soft'],
  ['win', 'background'],
  ['win', 'card'],
  ['loss', 'background'],
  ['loss', 'card'],
  ['warn', 'background'],
  ['warn', 'card'],
  ['destructive', 'background'],
];

describe.each(['light', 'dark'] as const)('%s theme contrast', (theme) => {
  const t = tokens[theme];

  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // Focus ring and borders of inputs are UI components: 3:1 (WCAG 1.4.11).
  it('focus ring is at least 3:1 on background and card', () => {
    expect(contrastRatio(t.ring, t.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t.ring, t.card)).toBeGreaterThanOrEqual(3);
  });
});
