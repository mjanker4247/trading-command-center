import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: { 900: "#0a0e1a", 800: "#0d1220", 700: "#0f1629", 600: "#1a1d2e" },
      },
      fontFamily: { mono: ["var(--font-mono)", "monospace"] },
    },
  },
  plugins: [],
};

export default config;
