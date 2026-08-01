import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0b0e11',
        panel: '#12161c',
        border: '#232a33',
        gold: '#e8b339',
        cyan: '#4fd1c5',
        status: {
          done: '#34d399',
          progress: '#e8b339',
          blocked: '#f87171',
          todo: '#94a3b8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
