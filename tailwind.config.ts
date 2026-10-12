import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI"', '"Microsoft YaHei UI"', '"Microsoft YaHei"', "sans-serif"],
        serif: ['"Segoe UI"', '"Microsoft YaHei UI"', '"Microsoft YaHei"', "sans-serif"],
        mono: ['"Cascadia Mono"', '"Microsoft YaHei UI"', "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
