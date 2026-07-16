// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google"; // 1. Ubah import menjadi Plus Jakarta Sans
import { Toaster } from "sonner";
import "./globals.css";
import NetworkStatus from "@/components/ui/NetworkStatus";

// 2. Inisialisasi font Plus Jakarta Sans dan buat variabelnya
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "Solit POS",
  description: "Realtime Payment & Inventory System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Solit POS",
  },
  icons: {
    icon: [
      { url: "/icons/manifest-icon-192.maskable.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/manifest-icon-512.maskable.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a2e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      {/* 3. Masukkan variabel font Plus Jakarta Sans */}
      <body className={`${plusJakartaSans.variable} font-sans antialiased`}>
        {/* ✅ Disable Next.js auto scroll-to-top saat navigasi */}
        <script
          dangerouslySetInnerHTML={{
            __html: `history.scrollRestoration = 'manual';`,
          }}
        />
        <NetworkStatus />
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}