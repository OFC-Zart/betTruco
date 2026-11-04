import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-bebas)", "Impact", "sans-serif"],
        placar: ["var(--font-placar)", "ui-monospace", "monospace"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        neon: "hsl(var(--neon))",
        ambar: "hsl(var(--ambar))",
        alerta: "hsl(var(--alerta))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "ao-vivo": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 hsl(var(--neon) / 0.6)" },
          "50%": { opacity: "0.7", boxShadow: "0 0 0 6px hsl(var(--neon) / 0)" },
        },
        pulo: {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.25)" },
          "100%": { transform: "scale(1)" },
        },
        flash: {
          "0%": { backgroundColor: "hsl(var(--neon) / 0.35)" },
          "100%": { backgroundColor: "transparent" },
        },
        subir: {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        flutuar: {
          "0%, 100%": { transform: "translateY(0) rotate(-6deg)" },
          "50%": { transform: "translateY(-14px) rotate(6deg)" },
        },
      },
      animation: {
        "ao-vivo": "ao-vivo 1.6s ease-in-out infinite",
        pulo: "pulo 350ms ease-out",
        flash: "flash 700ms ease-out",
        subir: "subir 200ms ease-out",
        flutuar: "flutuar 7s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
