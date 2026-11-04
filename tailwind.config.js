/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        app:              'rgb(var(--bg) / <alpha-value>)',
        surface:          'rgb(var(--surface) / <alpha-value>)',
        'surface-2':      'rgb(var(--surface-2) / <alpha-value>)',
        'surface-hover':  'rgb(var(--surface-hover) / <alpha-value>)',
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted:   'rgb(var(--fg-muted) / <alpha-value>)',
          subtle:  'rgb(var(--fg-subtle) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong:  'rgb(var(--border-strong) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          fg:      'rgb(var(--primary-fg) / <alpha-value>)',
          hover:   'rgb(var(--primary-hover) / <alpha-value>)',
          glow:    'rgb(var(--primary-glow) / <alpha-value>)',
        },
        neon: {
          cyan:    '#00f0ff',
          blue:    '#38bdf8',
          emerald: '#10b981',
          rose:    '#f43f5e',
          amber:   '#f59e0b',
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-spline-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
}
