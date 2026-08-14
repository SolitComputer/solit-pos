// next.config.ts — FULL FILE
import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

console.log("PWA Loaded");

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",

  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        // ✅ RSC responses + navigasi → JANGAN pernah cache
        urlPattern: ({ request, url }: { request: Request; url: URL }) =>
          request.mode === "navigate" ||
          request.headers.get("RSC") === "1" ||
          url.search.includes("_rsc=") ||
          url.search.includes("_next_router_prefetch="),
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
      },
      {
        // ✅ Static chunks — cache tapi dengan versioned URL (aman)
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

  async headers() {
    return [
      {
        // Semua halaman HTML
        source: "/((?!_next/static|_next/image|favicon.ico|assets).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
          {
            key: "Surrogate-Control",
            value: "no-store",
          },
        ],
      },
      {
        // Static assets boleh di-cache (sudah ada hash di nama file)
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        encoding: false,
      };
    }
    return config;
  },
};

export default withPWA(nextConfig);