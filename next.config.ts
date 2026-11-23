import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Aplicația completă (varianta clasică, un singur fișier HTML) rămâne disponibilă
  // la /clasic cât timp modulele se mută treptat în React.
  async redirects() {
    return [
      { source: "/clasic", destination: "/legacy/index.html", permanent: false },
    ];
  },
};

export default nextConfig;
