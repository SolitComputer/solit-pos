// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Poppins, Spline_Sans_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import "@/lib/patchPointerCapture";
import NetworkStatus from "@/components/ui/NetworkStatus";
import ServiceWorkerUpdater from "@/components/ui/ServiceWorkerUpdater";
import { ThemeProvider } from "@/components/ThemeProvider";

// Font utama (UI/teks) — Poppins
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

// Font angka & kode (harga, saldo, SN, invoice) — Spline Sans Mono
const splineMono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-spline-mono",
  display: "swap",
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
      { url: "/logo-solit.jpeg?v=3", type: "image/jpeg" },
      { url: "/icons/manifest-icon-192.maskable.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/manifest-icon-512.maskable.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/logo-solit.jpeg?v=3", type: "image/jpeg" },
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
    <html lang="id" suppressHydrationWarning>
      {/* Variabel font Geist (sans) + Geist Mono */}
      {/* Variabel font Poppins (sans) + Spline Sans Mono */}
      <body className={`${poppins.variable} ${splineMono.variable} font-sans antialiased`}>
        {/*  Disable Next.js auto scroll-to-top saat navigasi */}
        <script
          dangerouslySetInnerHTML={{
            __html: `history.scrollRestoration = 'manual';`,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <NetworkStatus />
          <ServiceWorkerUpdater />
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}