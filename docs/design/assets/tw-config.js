// Tailwind play-CDN config: every color maps to a theme token in app.css,
// so the same class works in light and dark (this mirrors the future shadcn/ui theme).
tailwind.config = {
  theme: {
    extend: {
      colors: Object.fromEntries(
        ['bg', 'surface', 'surface2', 'fg', 'muted', 'line', 'accent', 'win', 'loss', 'warn', 'shuttle'].map((k) => [
          k,
          `rgb(var(--${k}) / <alpha-value>)`,
        ]),
      ),
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
    },
  },
};
