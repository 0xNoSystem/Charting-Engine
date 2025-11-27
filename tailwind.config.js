import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./src/**/*.{ts,tsx,js,jsx}"],
    theme: {
        extend: {
            spacing: {
                30: "30px",
            },
            gridTemplateColumns: {
                13: "repeat(13, minmax(0, 1fr))",
            },
            zIndex: {
                1: "1",
                5: "5",
            },
        },
    },
    safelist: ["grid-cols-13", "mb-30", "z-1", "z-5"],
    plugins: [],
};

export default config;

