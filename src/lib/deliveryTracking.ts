// src/lib/deliveryTracking.ts
import { Capacitor, registerPlugin } from "@capacitor/core";

interface BGLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  bearing: number | null;
  time: number | null;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (position?: BGLocation, error?: { code: string; message: string }) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

export const isNativeApp = () => Capacitor.isNativePlatform();

type OnFix = (fix: { lat: number; lng: number; accuracy: number; speed: number | null }) => void;

/**
 * Mulai tracking. Native → foreground service (jalan walau layar mati).
 * Web/PWA → fallback watchPosition biasa (cuma jalan saat app foreground).
 * Return handle untuk stop().
 */
export async function startDeliveryTracking(onFix: OnFix): Promise<() => void> {
  if (isNativeApp()) {
    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: "Pengantaran aktif",
        backgroundMessage: "Solit POS sedang melacak lokasi pengiriman.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 20, // meter — hemat baterai, POST hanya saat bergerak
      },
      (position, error) => {
        if (error) {
          if (error.code === "NOT_AUTHORIZED") BackgroundGeolocation.openSettings();
          return;
        }
        if (position) {
          onFix({
            lat: position.latitude,
            lng: position.longitude,
            accuracy: position.accuracy,
            speed: position.speed,
          });
        }
      }
    );
    return () => void BackgroundGeolocation.removeWatcher({ id });
  }

  // Fallback web
  const watchId = navigator.geolocation.watchPosition(
    (pos) =>
      onFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
      }),
    (err) => console.warn("geo error", err),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}