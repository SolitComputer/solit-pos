// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.solit03.pos",
  appName: "Solit POS",
  webDir: "capacitor-shell",
  server: {
    url: "https://solit-pos.store",
    androidScheme: "https",
    cleartext: false,
  },
};

export default config;