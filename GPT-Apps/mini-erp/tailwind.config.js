/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ios: {
          blue: '#007AFF',
          green: '#34C759',
          orange: '#FF9500',
          red: '#FF3B30',
          background: '#F5F5F7',
          surface: '#FFFFFF',
          grouped: '#F2F2F7',
          separator: '#E5E5EA',
          label: '#1D1D1F',
          secondary: '#6E6E73',
        },
      },
      boxShadow: {
        ios: '0 18px 55px rgba(29, 29, 31, 0.08)',
        'ios-subtle': '0 1px 2px rgba(29, 29, 31, 0.06)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'Inter',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
