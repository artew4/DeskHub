/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Дизайн-токены: knowledge/Frontend_react/Core.md, раздел 4.3
      colors: {
        surface: { 0: '#0B0D10', 1: '#14171C', 2: '#1C2027' },
        fg: { primary: '#F2F4F7', secondary: '#A0A7B4', muted: '#5C6370' },
        status: { ok: '#22C55E', warn: '#F59E0B', bad: '#EF4444', critical: '#B91C1C', info: '#38BDF8' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        hero: ['56px', { lineHeight: '1' }],
        value: ['32px', { lineHeight: '1.1' }],
        label: ['14px', { lineHeight: '1.2', letterSpacing: '0.04em' }],
      },
      borderRadius: { card: '20px' },
      transitionTimingFunction: { kiosk: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    },
  },
  plugins: [],
}
