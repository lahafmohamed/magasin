import tailwindcssAnimate from "tailwindcss-animate";

/** Rampe 50..900 + DEFAULT adossée aux variables CSS `--<name>-<shade>`. */
const semanticRamp = (name) =>
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].reduce(
    (ramp, shade) => ({
      ...ramp,
      [shade]: `hsl(var(--${name}-${shade}) / <alpha-value>)`,
    }),
    { DEFAULT: `hsl(var(--${name}) / <alpha-value>)` },
  );

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
        // Rampes sémantiques statut/argent — définies en variables CSS dans index.css
        // (:root + .dark) pour être theme-aware. La rampe est inversée en mode sombre :
        // `text-success-700` / `bg-danger-50` se lisent correctement dans les deux
        // thèmes sans variante `dark:`.
        success: semanticRamp("success"),
        warning: semanticRamp("warning"),
        danger: semanticRamp("danger"),
        info: semanticRamp("info"),
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
      fontFamily: {
        // Inter est chargé dans index.html ; sans cette clé `font-sans` retombait
        // sur la pile Tailwind par défaut au lieu de la police du produit.
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        // Tailwind s'arrête à text-xs (12px) ; les micro-libellés (badges de
        // comptage, mentions de tuiles) réinventaient donc text-[10px]/[11px].
        "2xs": ["0.6875rem", { lineHeight: "0.875rem" }], // 11px
        "3xs": ["0.625rem", { lineHeight: "0.8125rem" }], // 10px
      },
      zIndex: {
        // Échelle nommée : les surcouches se comparaient jusqu'ici en z-[100].
        dropdown: "40",
        sidebar: "40",
        overlay: "50",
        modal: "50",
        toast: "60",
        tooltip: "70",
        skiplink: "80",
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
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
