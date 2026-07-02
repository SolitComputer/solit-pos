import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

console.log("PWA Loaded");

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {},

  // ✅ FIX: face-api.js mencoba import Node.js built-in 'fs' & 'path' di client bundle.
  // Karena face-api.js dipakai di browser (face recognition), webpack perlu tahu
  // bahwa module-module ini tidak tersedia di browser → set ke false (ignore).
  // Tanpa ini, akan muncul warning:
  // "Module not found: Can't resolve 'fs' in '.../face-api.js/build/es6/env'"
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        // Pertahankan fallback yang sudah ada (kalau ada)
        ...config.resolve.fallback,
        // Node.js built-ins yang dipakai face-api.js tapi tidak tersedia di browser
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default withPWA(nextConfig);