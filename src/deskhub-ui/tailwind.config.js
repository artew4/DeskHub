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
      // Тамагочи и плавные появления — только transform/opacity
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'cat-breathe': { '0%, 100%': { transform: 'scaleY(1)' }, '50%': { transform: 'scaleY(1.05)' } },
        'cat-tail': { '0%, 100%': { transform: 'rotate(-6deg)' }, '50%': { transform: 'rotate(12deg)' } },
        'cat-leg': { '0%, 100%': { transform: 'rotate(24deg)' }, '50%': { transform: 'rotate(-24deg)' } },
        'cat-bob': { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-1.5px)' } },
        'cat-blink': { '0%, 93%, 100%': { transform: 'scaleY(1)' }, '96%': { transform: 'scaleY(0.1)' } },
        'cat-swipe': { '0%': { transform: 'rotate(0)' }, '45%, 65%': { transform: 'rotate(-75deg)' }, '100%': { transform: 'rotate(0)' } },
        'cat-zzz': {
          '0%': { opacity: '0', transform: 'translate(0, 0)' },
          '25%': { opacity: '0.9' },
          '100%': { opacity: '0', transform: 'translate(10px, -22px)' },
        },
        'cat-heart': {
          '0%': { opacity: '0', transform: 'translate(-50%, 0) scale(0.6)' },
          '20%': { opacity: '1', transform: 'translate(-50%, -8px) scale(1)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -30px) scale(1)' },
        },
        twinkle: { '0%, 100%': { opacity: '0.25' }, '50%': { opacity: '1' } },
        steam: { '0%': { opacity: '0', transform: 'translateY(2px)' }, '50%': { opacity: '1' }, '100%': { opacity: '0', transform: 'translateY(-4px)' } },
      },
      animation: {
        'fade-in': 'fade-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'cat-breathe': 'cat-breathe 3.6s ease-in-out infinite',
        'cat-tail': 'cat-tail 2.4s ease-in-out infinite',
        'cat-leg': 'cat-leg 0.6s ease-in-out infinite',
        'cat-bob': 'cat-bob 0.6s ease-in-out infinite',
        'cat-blink': 'cat-blink 5s linear infinite',
        'cat-swipe': 'cat-swipe 700ms ease-in-out both',
        'cat-zzz': 'cat-zzz 3.3s ease-out infinite',
        'cat-heart': 'cat-heart 1.4s ease-out forwards',
        twinkle: 'twinkle 3s ease-in-out infinite',
        steam: 'steam 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
}
