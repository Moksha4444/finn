import type { NextConfig } from "next";

// Static export: the feed is precomputed JSON in public/data, so no server is needed (see PLAN.md §2).
const nextConfig: NextConfig = {
  output: "export",
  devIndicators: false, // the floating dev badge covers feed rows on a phone
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
