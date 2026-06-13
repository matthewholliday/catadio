/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#12141a',
        surface: '#1a1d27',
        border: '#2a2f3d',
        accent: '#6366f1',
        success: '#22c55e',
        danger: '#ef4444',
        warn: '#f59e0b',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
