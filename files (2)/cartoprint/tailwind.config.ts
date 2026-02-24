import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#fafaf8',
        panel: '#ffffff',
        border: {
          DEFAULT: '#e8e8e6',
          light: '#f0f0ee',
        },
        text: {
          DEFAULT: '#1a1a1a',
          muted: '#6b6b6b',
          light: '#999999',
        },
        toggle: {
          on: '#1a1a1a',
          off: '#d4d4d0',
        },
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      spacing: {
        'panel': '320px',
        'header': '64px',
      },
      letterSpacing: {
        'wide-caps': '0.15em',
        'caps': '0.08em',
      },
    },
  },
  plugins: [],
};

export default config;
