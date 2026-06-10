import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-base": "var(--bg-base)",
        "bg-surface": "var(--bg-surface)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-input": "var(--bg-input)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        danger: "var(--danger)",
        "status-open": "var(--status-open)",
        "status-closed": "var(--status-closed)",
        "status-unknown": "var(--status-unknown)",
        "status-open-bg": "var(--status-open-bg)",
        "status-closed-bg": "var(--status-closed-bg)",
        "status-unknown-bg": "var(--status-unknown-bg)",
      },
    },
  },
  plugins: [],
};
export default config;
