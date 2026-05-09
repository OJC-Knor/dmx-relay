/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0c",
        surface: "#16161a",
        surface2: "#1f1f25",
        line: "#2a2a30",
        muted: "#8a8a94",
        text: "#f4f4f6",
        accent: "#6c8eff",
        warn: "#ff9a3c",
        danger: "#ff4d6a",
        ok: "#51cf66",
        // fixture-type swatches
        tripar: "#4a8cff",
        focus: "#ff9a3c",
        groot: "#ad6cff",
        atomic: "#ff4d6a",
        fog: "#6cd9ff",
      },
      fontFamily: {
        sans: ["-apple-system", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
