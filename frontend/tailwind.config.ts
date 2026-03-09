import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          black: '#08080f',
          dark: '#0d0d1a',
          card: '#111122',
          border: '#1e2040',
          cyan: '#00d4ff',
          'cyan-dim': '#0099bb',
          purple: '#a855f7',
          'purple-dim': '#7c3aed',
          green: '#00ff9f',
          'green-dim': '#00cc7f',
          red: '#ff4466',
          text: '#e2e8f0',
          muted: '#64748b',
          subtle: '#334155',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'cyber-cyan': '0 0 20px rgba(0, 212, 255, 0.3)',
        'cyber-purple': '0 0 20px rgba(168, 85, 247, 0.3)',
        'cyber-green': '0 0 20px rgba(0, 255, 159, 0.3)',
        'cyber-sm': '0 0 8px rgba(0, 212, 255, 0.15)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan': 'scan 2s linear infinite',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
