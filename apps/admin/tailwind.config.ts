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
        "edge-cyan": "#00e5c3",
        "edge-dark": "#0a0e17",
        "edge-card": "#0d1219",
        "edge-border": "rgba(255,255,255,0.08)",
        // Theme-aware colors
        "t-bg": "var(--bg-primary)",
        "t-bg2": "var(--bg-secondary)",
        "t-card": "var(--bg-card)",
        "t-input": "var(--bg-input)",
        "t-hover": "var(--bg-hover)",
        "t-hover-subtle": "var(--bg-hover-subtle)",
        "t-thead": "var(--bg-thead)",
        "t-overlay": "var(--modal-overlay)",
      },
      textColor: {
        "t-primary": "var(--text-primary)",
        "t-secondary": "var(--text-secondary)",
        "t-muted": "var(--text-muted)",
        "t-label": "var(--text-label)",
        "t-placeholder": "var(--text-placeholder)",
      },
      borderColor: {
        "t-default": "var(--border-default)",
        "t-input": "var(--border-input)",
      },
      fontFamily: {
        roboto: ["Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
