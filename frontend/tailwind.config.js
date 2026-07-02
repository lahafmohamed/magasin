import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        success: {
          DEFAULT: "#059669",
          50: "#ECFDF5", 100: "#D1FAE5", 200: "#A7F3D0", 300: "#6EE7B7", 400: "#34D399",
          500: "#059669", 600: "#047857", 700: "#065F46", 800: "#064E3B", 900: "#022C22",
        },
        warning: {
          DEFAULT: "#D97706",
          50: "#FFFBEB", 100: "#FEF3C7", 200: "#FDE68A", 300: "#FCD34D", 400: "#FBBF24",
          500: "#D97706", 600: "#B45309", 700: "#92400E", 800: "#78350F", 900: "#451A03",
        },
        danger: {
          DEFAULT: "#DC2626",
          50: "#FEF2F2", 100: "#FEE2E2", 200: "#FECACA", 300: "#FCA5A5", 400: "#F87171",
          500: "#DC2626", 600: "#B91C1C", 700: "#991B1B", 800: "#7F1D1D", 900: "#450A0A",
        },
        info: {
          DEFAULT: "#2563EB",
          50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE", 300: "#93C5FD", 400: "#60A5FA",
          500: "#2563EB", 600: "#1D4ED8", 700: "#1E40AF", 800: "#1E3A8A", 900: "#172554",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE",
          500: "#1D4ED8", 600: "#1E40AF", 700: "#1E3A8A", 900: "#172554",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Elevation scale — consistent depth for cards / popovers / sheets / modals
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        sm: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)",
        DEFAULT: "0 2px 6px -1px rgb(0 0 0 / 0.10), 0 1px 3px -1px rgb(0 0 0 / 0.08)",
        md: "0 4px 12px -2px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
        lg: "0 10px 24px -4px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.08)",
        xl: "0 20px 40px -8px rgb(0 0 0 / 0.16)",
      },
      transitionTimingFunction: {
        // ease-out for entering, ease-in for exiting (skill §7)
        "out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-soft": "cubic-bezier(0.4, 0, 1, 1)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
        250: "250ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out both",
        "fade-in-up": "fade-in-up 0.25s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
