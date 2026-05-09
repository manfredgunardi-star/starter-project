/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7ee', 100: '#fdead7', 200: '#f9d1ae',
          300: '#f5b07a', 400: '#ef8644', 500: '#eb6820',
          600: '#dc4f16', 700: '#b63a14', 800: '#912f19',
          900: '#752918', DEFAULT: '#eb6820'
        }
      }
    }
  },
  plugins: []
}
