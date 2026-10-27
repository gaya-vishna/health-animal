/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        pixelify: ['"Pixelify Sans"', 'cursive', 'sans-serif'],
        sans: ['Outfit', '"Pixelify Sans"', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        forest: {
          950: '#09150f',
          900: '#0d1f17',
          800: '#142f23',
          700: '#1e4433',
          600: '#2b5f47',
          500: '#3d8361',
          400: '#58a87f',
          300: '#83cca5',
          200: '#b8e6cf',
          100: '#e1f5ec',
        },
        wood: {
          950: '#1a0e07',
          900: '#25160d',
          800: '#382215',
          700: '#523420',
          600: '#754b30',
          500: '#9c6644',
          400: '#b07d59',
          300: '#c69775',
          200: '#ddb896',
          100: '#ede0d4',
        },
        game: {
          red: '#ff4d4d',
          orange: '#ff793f',
          yellow: '#fbc531',
          green: '#2ecc71',
          cyan: '#00d2d3',
          blue: '#3867d6',
          purple: '#8854d0',
          pink: '#e84393',
          gold: '#e1b12c',
        },
        brand: {
          emerald: '#34d399',
          amber: '#fbbf24',
          lavender: '#a78bfa',
          cyan: '#22d3ee',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'border-glow': 'borderGlow 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        borderGlow: {
          '0%, 100%': { boxShadow: '0 0 8px 2px rgba(251, 191, 36, 0.3)' },
          '50%': { boxShadow: '0 0 20px 6px rgba(251, 191, 36, 0.6)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
