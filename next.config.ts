import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

console.log("PWA Loaded");

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",

  // ✅ FIX cache basi: SW baru langsung gantiin yang lama tiap deploy
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        // 1. Halaman (HTML/RSC): SELALU dari network → cegah RSC mentah / versi basi
        urlPattern: ({ request }: { request: Request }) =>
          request.mode === "navigate",
        handler: "NetworkOnly",
      },
      {
        // 2. API routes: JANGAN pernah di-cache → data POS selalu real-time
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
      {
        // 3. Aset statis Next.js (JS/CSS build): boleh cache, ambil dari cache dulu
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith("/_next/static/"),
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }, // 30 hari
        },
      },
      {
        // 4. Gambar & font: cache biar cepat, tapi tetap update di background
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