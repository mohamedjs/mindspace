/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Semantic tokens, defined per theme as rgb triplets in global.css.
        // <alpha-value> keeps bg-surface/80, border-line/50 etc. working.
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        board: 'rgb(var(--board) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',

        // `header` predates the semantic tokens and is used interchangeably
        // with surface — alias it so old classNames keep theming correctly.
        header: 'rgb(var(--surface) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
