import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app is per-user and request-time (auth, filters), so we
  // use the classic dynamic rendering model instead of Cache Components.
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
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
