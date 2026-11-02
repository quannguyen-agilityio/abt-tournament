// globals.css is the single source of the theme colors; this reads them back
// so tests can check contrast on the values that actually ship.

export type ThemeTokens = Record<string, string>;

function declarations(css: string, selector: string): ThemeTokens {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Selector not found in CSS: ${selector}`);
  const end = css.indexOf('}', start);
  const tokens: ThemeTokens = {};
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) tokens[m[1]] = m[2].toLowerCase();
  return tokens;
}

export function parseThemeTokens(css: string) {
  return {
    light: declarations(css, ':root'),
    dark: declarations(css, ":root[data-theme='dark']"),
    // The same dark values, applied when the system is dark and no explicit choice is stored.
    darkSystem: declarations(css, ":root:not([data-theme='light'])"),
  };
}
