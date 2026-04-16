import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "edge-cyan": "rgb(var(--color-primary-rgb, 0 229 195) / <alpha-value>)",
        "edge-dark": "#0a0e17",
        "edge-card": "#0d1219",
      },
      fontFamily: {
        roboto: ["var(--font-roboto)", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
