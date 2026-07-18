/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf8f0',
          100: '#f9edda',
          200: '#f2d6a8',
          300: '#e8b96e',
          400: '#d4943a',  // Primary warm amber accent
          500: '#c07d28',
          600: '#a46420',
          700: '#7d4b1c',
          800: '#5c3718',
          900: '#3d2512',
        },
        surface: {
          0:   '#0b0d11',  // Deepest bg
          50:  '#0f1218',  // Main app bg
          100: '#151922',  // Card bg
          200: '#1c2130',  // Elevated surface
          300: '#252b3d',  // Hover / active
          400: '#2f3750',  // Input bg
          500: '#3a4363',  // Borders
        },
        slate: {
          350: '#a0aec4',
        },
        accent: {
          emerald: '#34d399',
          rose:    '#fb7185',
          sky:     '#38bdf8',
          violet:  '#a78bfa',
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        'hero': ['clamp(2.8rem, 5.5vw, 4.8rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'title': ['clamp(1.6rem, 3vw, 2.4rem)', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'glow':       '0 0 40px -8px rgba(212,148,58,0.15)',
        'glow-sm':    '0 0 20px -4px rgba(212,148,58,0.1)',
        'card':       '0 2px 20px -4px rgba(0,0,0,0.5)',
        'card-hover': '0 8px 40px -8px rgba(0,0,0,0.6)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
      },
      animation: {
        'fade-up':     'fadeUp 0.6s ease-out both',
        'fade-in':     'fadeIn 0.5s ease-out both',
        'slide-in-r':  'slideInRight 0.5s ease-out both',
        'pulse-ring':  'pulseRing 2s ease-out infinite',
        'spin-slow':   'spin 8s linear infinite',
        'float':       'float 6s ease-in-out infinite',
        'scan':        'scan 4s linear infinite',
        'progress':    'progressPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp:        { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:        { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideInRight:  { '0%': { opacity: '0', transform: 'translateX(24px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        pulseRing:     { '0%': { transform: 'scale(0.95)', opacity: '1' }, '100%': { transform: 'scale(1.4)', opacity: '0' } },
        float:         { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        scan:          { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100vh)' } },
        progressPulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
    },
  },
  plugins: [],
};
