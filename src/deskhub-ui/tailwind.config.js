/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Дизайн-токены: knowledge/Frontend_react/Core.md, раздел 4.3.
      // surface/fg берутся из CSS-переменных темы (src/index.css: .theme-morning / -day / -evening / -night);
      // формат «R G B» сохраняет модификатор прозрачности (bg-surface-2/50).
      colors: {
        surface: {
          0: 'rgb(var(--bg-main) / <alpha-value>)',
          1: 'rgb(var(--bg-card) / <alpha-value>)',
          2: 'rgb(var(--bg-elevated) / <alpha-value>)',
        },
        fg: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
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
        'cat-breathe': { '0%, 100%': { transform: 'scale(1, 1)' }, '45%': { transform: 'scale(1.012, 1.05)' } },
        'cat-tail-twitch': { '0%, 88%, 100%': { transform: 'rotate(0)' }, '92%': { transform: 'rotate(-14deg)' }, '96%': { transform: 'rotate(6deg)' } },
        'cat-tail-quiver': { '0%, 100%': { transform: 'rotate(-4deg)' }, '50%': { transform: 'rotate(4deg)' } },
        'cat-hop': { '0%, 100%': { transform: 'translateY(0)' }, '35%': { transform: 'translateY(-11px)' }, '70%': { transform: 'translateY(0)' } },
        'cat-stretch': { '0%': { transform: 'scale(0.96, 1.02)' }, '50%': { transform: 'scale(1.14, 0.9)' }, '100%': { transform: 'scale(0.96, 1.02)' } },
        'cat-yawn': { '0%, 20%, 100%': { transform: 'scaleY(0.2)' }, '45%, 70%': { transform: 'scaleY(1)' } },
        'cat-groom': { '0%, 100%': { transform: 'rotate(0)' }, '50%': { transform: 'rotate(-14deg) translateY(1px)' } },
        'cat-head-tilt': { '0%, 100%': { transform: 'rotate(-6deg)' }, '50%': { transform: 'rotate(4deg)' } },
        'cat-wiggle': { '0%, 100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-5deg)' }, '75%': { transform: 'rotate(5deg)' } },
        'cat-bat': { '0%, 100%': { transform: 'rotate(10deg)' }, '50%': { transform: 'rotate(-42deg)' } },
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
        // Погода за окном комнаты кота (RoomAtmosphere.tsx) — только transform/opacity
        'cloud-drift': { from: { transform: 'translate3d(-90px, 0, 0)' }, to: { transform: 'translate3d(150px, 0, 0)' } },
        'precip-fall': { from: { transform: 'translate3d(0, 0, 0)' }, to: { transform: 'translate3d(var(--dx), var(--dy), 0)' } },
        'snow-sway': { '0%, 100%': { transform: 'translate3d(-5px, 0, 0)' }, '50%': { transform: 'translate3d(5px, 0, 0)' } },
        lightning: { '0%, 90%, 92.5%, 95.5%, 100%': { opacity: '0' }, '91%': { opacity: '0.75' }, '94%': { opacity: '0.45' } },
        // Реакции кота (полировка)
        'cat-startle-jump': { '0%': { transform: 'translateY(0)' }, '30%': { transform: 'translateY(-16px)' }, '55%': { transform: 'translateY(0)' }, '70%': { transform: 'translateY(-4px)' }, '100%': { transform: 'translateY(0)' } },
        'cat-tremble': { '0%, 100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-0.8px)' }, '75%': { transform: 'translateX(0.8px)' } },
        'cat-pop': {
          '0%': { opacity: '0', transform: 'translateY(4px) scale(0.4)' },
          '18%': { opacity: '1', transform: 'translateY(-6px) scale(1.2)' },
          '30%': { transform: 'translateY(-6px) scale(1)' },
          '80%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-14px) scale(1)' },
        },
        steam: { '0%': { opacity: '0', transform: 'translateY(2px)' }, '50%': { opacity: '1' }, '100%': { opacity: '0', transform: 'translateY(-4px)' } },
      },
      animation: {
        'fade-in': 'fade-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'cat-breathe': 'cat-breathe 4.4s ease-in-out infinite',
        'cat-tail-twitch': 'cat-tail-twitch 7s ease-in-out infinite',
        'cat-tail-quiver': 'cat-tail-quiver 0.18s linear infinite',
        'cat-hop': 'cat-hop 0.45s ease-out infinite',
        'cat-stretch': 'cat-stretch 3.6s ease-in-out infinite',
        'cat-yawn': 'cat-yawn 3.6s ease-in-out infinite',
        'cat-groom': 'cat-groom 0.7s ease-in-out infinite',
        'cat-head-tilt': 'cat-head-tilt 2.8s ease-in-out infinite',
        'cat-wiggle': 'cat-wiggle 0.5s ease-in-out infinite',
        'cat-bat': 'cat-bat 0.36s ease-in-out infinite',
        'cat-tail': 'cat-tail 3.2s ease-in-out infinite',
        'cat-leg': 'cat-leg 0.6s ease-in-out infinite',
        'cat-bob': 'cat-bob 0.6s ease-in-out infinite',
        'cat-blink': 'cat-blink 5s linear infinite',
        'cat-swipe': 'cat-swipe 700ms ease-in-out both',
        'cat-zzz': 'cat-zzz 3.3s ease-out infinite',
        'cat-heart': 'cat-heart 1.4s ease-out forwards',
        twinkle: 'twinkle 3s ease-in-out infinite',
        'cloud-drift': 'cloud-drift 70s linear infinite',
        'precip-fall': 'precip-fall 0.6s linear infinite',
        'snow-sway': 'snow-sway 3.5s ease-in-out infinite',
        lightning: 'lightning 9s linear infinite',
        'cat-startle-jump': 'cat-startle-jump 0.6s ease-out both',
        'cat-tremble': 'cat-tremble 0.09s linear infinite',
        'cat-pop': 'cat-pop 1.6s ease-out forwards',
        steam: 'steam 2.4s ease-out infinite',
      },
    },
  },
  plugins: [
    // light: — для светлых тем (утро, день): например, затемнить жёлтое солнце, невидимое на белом
    ({ addVariant }) => addVariant('light', ':is(.theme-morning, .theme-day) &:not(:where(.theme-locked, .theme-locked *))'),
  ],
}
