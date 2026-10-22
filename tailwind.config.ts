import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#0a0b0d",
          900: "#111318",
          800: "#181b21",
          700: "#22262e",
          600: "#2e333d",
          400: "#8b93a1",
          200: "#d3d7de",
        },
        accent: {
          DEFAULT: "#3dd9c4",
          dim: "#1f7a6d",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
