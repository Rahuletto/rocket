/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        light: "var(--background-light)",
        lighter: "var(--background-lighter)",
        files: "var(--files)",
        color: "var(--color)",
        red: "var(--red)",
        green: "var(--green)",
        yellow: "var(--yellow)",
      },
    },
    fontFamily: {
      'sans': ['system-ui'],
    }
  },
  plugins: [],
}
