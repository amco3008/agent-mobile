/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Factorio-inspired industrial palette
        factory: {
          bg: '#1a1a1a',
          panel: '#2d2d2d',
          border: '#404040',
          highlight: '#4a4a4a',
        },
        ore: {
          iron: '#6b8cae',
          copper: '#c87533',
          coal: '#3d3d3d',
          stone: '#8b7355',
        },
        signal: {
          green: '#00ff00',
          yellow: '#ffcc00',
          red: '#ff3333',
          blue: '#3399ff',
        },
        belt: {
          yellow: '#d4a017',
          red: '#cc3333',
          blue: '#3366cc',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 10px rgba(0, 255, 0, 0.3)',
        'glow-yellow': '0 0 10px rgba(255, 204, 0, 0.3)',
        'glow-red': '0 0 10px rgba(255, 51, 51, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flow': 'flow 2s linear infinite',
      },
      keyframes: {
        flow: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '100% 0%' },
        },
      },
    },
  },
  plugins: [],
}
