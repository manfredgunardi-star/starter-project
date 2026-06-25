/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        claret: { DEFAULT: '#8E1F2F', deep: '#6E0F1B', soft: '#B83242', bg: '#FAE6E9' },
        gold:   { DEFAULT: '#F1A53A', deep: '#D88A1F', bg: '#FBE9C9' },
        orange: { DEFAULT: '#E76A1F', bg: '#FDECE0' },
        cream:  '#FAF6EE',
        paper:  '#FFFFFF',
        ink:    { DEFAULT: '#1B1410', soft: '#3F332D' },
        mute:   { DEFAULT: '#7A6B61', soft: '#A89A8E' },
        line:   { DEFAULT: '#E8DFD2', soft: '#F0E8DA' },
        ok:     { DEFAULT: '#3D7A4F', bg: '#E8F0E8' },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'monospace'],
      },
      boxShadow: {
        window: '0 30px 80px -20px rgba(110,15,27,0.55), 0 8px 24px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(241,165,58,0.06)',
        panel:  '0 24px 60px -20px rgba(110,15,27,0.25), 0 2px 0 rgba(0,0,0,0.04)',
        toast:  '0 10px 30px -10px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
};
