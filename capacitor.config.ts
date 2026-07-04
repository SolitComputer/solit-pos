import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.solit03.pos",
  appName: "Solit POS",
  webDir: "capacitor-shell",
  server: {
    // ✅ Ganti dengan domain Vercel production kamu
    url: "https://solit-pos.vercel.app",
    androidScheme: "https",
    cleartext: false,
  },
  plugins: {
    // ✅ Penting untuk Phase 2 (lihat catatan throttle di bawah):
    // routing fetch lewat native HTTP + sinkron cookie auth
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
  },
};

export default config;