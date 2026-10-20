// === [TAG MODUL: Konfigurasi Desain Tailwind CSS (tailwind.config.js)] ===
// Penjelasan: Konfigurasi tema Tailwind CSS yang mendefinisikan palet warna Material 3 / Stitch Design System, radius sudut, tipografi, dan skala jarak kustom.

/** @type {import('tailwindcss').Config} */
tailwind.config = {
    darkMode: "class",
    theme: {
        extend: {
            // === [TAG KONFIGURASI: Palet Warna Tema (Design Tokens & Colors)] ===
            // Penjelasan: Nilai warna primer (indigo #3525cd), sekunder (emerald #006c49), permukaan terang/gelap, dan status error untuk konsistensi visual aplikasi.
            "colors": {
                "secondary-fixed": "#6ffbbe",
                "on-primary-fixed": "#0f0069",
                "secondary-container": "#6cf8bb",
                "surface": "#f9f9ff",
                "on-tertiary-fixed": "#351000",
                "on-primary-fixed-variant": "#3323cc",
                "on-tertiary-fixed-variant": "#7b2f00",
                "outline-variant": "#c7c4d8",
                "error-container": "#ffdad6",
                "surface-dim": "#cfdaf2",
                "on-secondary-container": "#00714d",
                "on-surface-variant": "#464555",
                "background": "#f9f9ff",
                "tertiary-fixed": "#ffdbcc",
                "on-secondary-fixed": "#002113",
                "primary": "#3525cd",
                "primary-fixed-dim": "#c3c0ff",
                "surface-tint": "#4d44e3",
                "outline": "#777587",
                "secondary-fixed-dim": "#4edea3",
                "on-surface": "#111c2d",
                "surface-container": "#e7eeff",
                "surface-variant": "#d8e3fb",
                "inverse-primary": "#c3c0ff",
                "on-tertiary-container": "#ffd2be",
                "on-background": "#111c2d",
                "tertiary-fixed-dim": "#ffb695",
                "error": "#ba1a1a",
                "on-secondary": "#ffffff",
                "surface-bright": "#f9f9ff",
                "on-error-container": "#93000a",
                "surface-container-highest": "#d8e3fb",
                "on-error": "#ffffff",
                "on-secondary-fixed-variant": "#005236",
                "on-primary": "#ffffff",
                "tertiary": "#7e3000",
                "on-primary-container": "#dad7ff",
                "on-tertiary": "#ffffff",
                "inverse-surface": "#263143",
                "primary-container": "#4f46e5",
                "surface-container-low": "#f0f3ff",
                "secondary": "#006c49",
                "inverse-on-surface": "#ecf1ff",
                "surface-container-high": "#dee8ff",
                "tertiary-container": "#a44100",
                "surface-container-lowest": "#ffffff",
                "primary-fixed": "#e2dfff"
            },
            // === [TAG KONFIGURASI: Radius Sudut, Jarak, & Tipografi (Layout & Typography Tokens)] ===
            // Penjelasan: Nilai radius sudut melengkung, grid spacing, keluarga font (Inter & JetBrains Mono), dan skala ukuran teks.
            "borderRadius": {
                "DEFAULT": "0.25rem",
                "lg": "0.5rem",
                "xl": "0.75rem",
                "full": "9999px"
            },
            "spacing": {
                "gutter": "24px",
                "container-max": "1440px",
                "sm": "8px",
                "lg": "24px",
                "md": "16px",
                "base": "4px",
                "xl": "32px",
                "xs": "4px",
                "margin-mobile": "16px"
            },
            "fontFamily": {
                "display-lg": ["Inter", "sans-serif"],
                "mono-md": ["JetBrains Mono", "monospace"],
                "label-md": ["Inter", "sans-serif"],
                "headline-lg-mobile": ["Inter", "sans-serif"],
                "headline-lg": ["Inter", "sans-serif"],
                "body-lg": ["Inter", "sans-serif"],
                "body-md": ["Inter", "sans-serif"],
                "title-md": ["Inter", "sans-serif"]
            },
            "fontSize": {
                "display-lg": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
                "mono-md": ["13px", { "lineHeight": "20px", "fontWeight": "400" }],
                "label-md": ["12px", { "lineHeight": "16px", "letterSpacing": "0.01em", "fontWeight": "500" }],
                "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
                "headline-lg": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
                "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }],
                "body-md": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
                "title-md": ["18px", { "lineHeight": "28px", "fontWeight": "600" }]
            }
        }
    }
};
