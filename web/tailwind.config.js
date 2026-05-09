import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        // surfaces & ink
        bg:        "#08080a",
        bg2:       "#0d0d10",
        surface:   "#141418",
        surface2:  "#1a1a20",
        surface3:  "#22222a",
        line:      "#2a2a32",
        line2:     "#36363f",
        muted:     "#8a8a94",
        mutedFg:   "#aeaeb6",
        text:      "#f4f4f6",

        // semantic
        accent:    "#7c92ff",
        accentMuted: "#5b6cd6",
        warn:      "#ffa84d",
        danger:    "#ff5070",
        ok:        "#4cd384",

        // fixture types
        tripar:  "#5b9dff",
        focus:   "#ffa64d",
        groot:   "#b87cff",
        atomic:  "#ff5070",
        fog:     "#5fd6ff",
        pinspot: "#fde047",
        spotlight: "#fbbf24",
      },
      fontFamily: {
        sans: ['"Inter"', '"InterVariable"', "-apple-system", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      fontSize: {
        // tighter letter-spacing on headings
        h1: ["28px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "700" }],
        h2: ["20px", { lineHeight: "26px", letterSpacing: "-0.01em", fontWeight: "600" }],
        h3: ["16px", { lineHeight: "22px", fontWeight: "600" }],
      },
      boxShadow: {
        soft: "0 2px 6px rgba(0,0,0,0.25), 0 8px 32px rgba(0,0,0,0.4)",
        glow: "0 0 0 1px rgba(124,146,255,0.18), 0 8px 32px -8px rgba(124,146,255,0.35)",
      },
      keyframes: {
        "fade-in":   { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up":  { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "scale-in":  { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        "fade-in":  "fade-in 160ms ease-out",
        "slide-up": "slide-up 220ms ease-out",
        "scale-in": "scale-in 150ms ease-out",
      },
    },
  },
  plugins: [animate],
};
