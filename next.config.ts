import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

console.log("PWA Loaded");

const withPWA = withPWAInit({
  dest: "public",
  // ✅ MATIKAN cache navigasi/RSC — ini akar 2 bug tadi
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",

  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        // Navigasi + RSC → SELALU network, JANGAN cache
        // (biar middleware absensi selalu jalan)
        urlPattern: ({ request, url }: { request: Request; url: URL }) =>
          request.mode === "navigate" ||
          request.headers.get("RSC") === "1" ||
          url.search.includes("_rsc="),
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith("/_next/static/"),
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: ({ request }: { request: Request }) =>
          ["image", "font"].includes(request.destination),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "assets",
          expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
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
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default withPWA(nextConfig);