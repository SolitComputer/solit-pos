"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export default function NetworkStatus() {
  useEffect(() => {
    const offline = () => {
      toast.error("Tidak ada koneksi internet");
    };

    const online = () => {
      toast.success("Koneksi kembali normal");
    };

    window.addEventListener("offline", offline);
    window.addEventListener("online", online);

    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  return null;
}