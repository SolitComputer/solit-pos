import { useEffect, useState } from "react";

export interface NotifSoundSettings {
  sound_key: string;
  repeat_enabled: boolean;
  repeat_interval_ms: number;
  custom_sound_url: string | null;
}

const DEFAULT_SETTINGS: NotifSoundSettings = {
  sound_key: "default",
  repeat_enabled: false,
  repeat_interval_ms: 4000,
  custom_sound_url: null,
};

/** Ambil pengaturan suara notifikasi milik user yang lagi login (diatur Admin). */
export function useNotificationSettings(userId: string | null): NotifSoundSettings {
  const [settings, setSettings] = useState<NotifSoundSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/notification-settings/${userId}`)
      .then((r) => r.json())
      .then((r) => { if (r?.success && r.data) setSettings(r.data); })
      .catch(() => {});
  }, [userId]);

  return settings;
}