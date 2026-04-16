import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        background: "#FAFAF7",
        foreground: "#1A1A1A",
        accent: {
          DEFAULT: "#4C566A",
          foreground: "#FAFAF7",
        },
        muted: {
          DEFAULT: "#F0EFE9",
          foreground: "#6B7280",
        },
        border: "#E5E4DF",
        evidence: {
          bg: "#F0E9CC",
          text: "#7A6B3A",
        },
        risk: {
          DEFAULT: "#C0392B",
          muted: "#F5E6E4",
        },
      },
      fontFamily: {
        serif: ["var(--font-source-serif)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
