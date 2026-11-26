/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#002C6C", 600: "#1E5190", 50: "#EEF3FA" },
        gold: { DEFAULT: "#D3A13B", 300: "#E4C075", 50: "#FBF5E8" },
        ink: "#1F2937",
        paper: "#F4F6F9",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
