/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface": "#f9f9ff",
        "surface-dim": "#cddbf5",
        "surface-bright": "#f9f9ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f0f3ff",
        "surface-container": "#e7eeff",
        "surface-container-high": "#dee8ff",
        "surface-container-highest": "#d6e3fe",
        "on-surface": "#0e1c2f",
        "on-surface-variant": "#434656",
        "inverse-surface": "#243145",
        "inverse-on-surface": "#ebf1ff",
        "outline": "#737687",
        "outline-variant": "#c3c5d9",
        "surface-tint": "#004fe5",
        "primary": "#0048d4",
        "on-primary": "#ffffff",
        "primary-container": "#1e60ff",
        "on-primary-container": "#f2f2ff",
        "inverse-primary": "#b6c4ff",
        "secondary": "#006b5b",
        "on-secondary": "#ffffff",
        "secondary-container": "#53f8d9",
        "on-secondary-container": "#00705f",
        "tertiary": "#b0071c",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#d42b31",
        "on-tertiary-container": "#fff1ef",
        "error": "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        "primary-fixed": "#dce1ff",
        "primary-fixed-dim": "#b6c4ff",
        "on-primary-fixed": "#00164f",
        "on-primary-fixed-variant": "#003bb0",
        "secondary-fixed": "#57fbdb",
        "secondary-fixed-dim": "#2adec0",
        "on-secondary-fixed": "#00201a",
        "on-secondary-fixed-variant": "#005144",
        "tertiary-fixed": "#ffdad7",
        "tertiary-fixed-dim": "#ffb3ae",
        "on-tertiary-fixed": "#410004",
        "on-tertiary-fixed-variant": "#930014",
        "background": "#f9f9ff",
        "on-background": "#0e1c2f",
        "surface-variant": "#d6e3fe"
      },
      borderRadius: {
        "sm": "0.25rem",
        "DEFAULT": "0.5rem",
        "md": "0.75rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "full": "9999px"
      },
      spacing: {
        "gutter": "1rem",
        "gutter-sm": "0.75rem",
        "margin": "1rem",
        "margin-lg": "1.5rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "space-lg": "1rem",
        "space-xl": "1.5rem"
      },
      fontFamily: {
        "sans": ["Plus Jakarta Sans", "Inter", "sans-serif"],
        "display": ["Plus Jakarta Sans", "sans-serif"],
        "body": ["Plus Jakarta Sans", "Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      }
    }
  },
  plugins: []
};
