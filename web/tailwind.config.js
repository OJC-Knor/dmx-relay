import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        // surfaces & ink — console style: near-black, hairline borders
        bg:        "#08080a",
        bg2:       "#0b0b0e",   // wells: inputs, readouts, stage
        surface:   "#0e0e11",   // panels
        surface2:  "#16161a",   // keys
        surface3:  "#1f1f24",   // tracks, unlit segments
        line:      "#1f1f24",   // panel borders
        line2:     "#2a2a31",   // key borders
        muted:     "#7c7c86",
        mutedFg:   "#9a9aa4",
        text:      "#e6e6e9",

        // semantic — one colour per job, as on a lighting desk
        accent:    "#7c92ff",   // selection, beats
        accentMuted: "#5b6cd6",
        beat:      "#ffb020",   // tempo, downbeat, master below full
        live:      "#38e08c",   // running / on air
        warn:      "#ffb020",
        danger:    "#ff4d6a",
        ok:        "#38e08c",

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
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        key: "5px",     // buttons / pads
        panel: "6px",   // panels
      },
      fontSize: {
        // tighter letter-spacing on headings
        h1: ["28px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "700" }],
        h2: ["20px", { lineHeight: "26px", letterSpacing: "-0.01em", fontWeight: "600" }],
        h3: ["16px", { lineHeight: "22px", fontWeight: "600" }],
      },
      boxShadow: {
        soft: "0 8px 24px rgba(0,0,0,0.5)",
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
