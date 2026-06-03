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
  turbopack: {}, // ← ini yang menghilangkan error
};

export default withPWA(nextConfig);