/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e5ff',
          200: '#bcd1ff',
          300: '#8eb2ff',
          400: '#5a89ff',
          500: '#3563f5',
          600: '#2247d9',
          700: '#1c39af',
          800: '#1c338a',
          900: '#1c2f6e',
        },
      },
    },
  },
  plugins: [],
};
