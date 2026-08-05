"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface OverlayContextValue {
  isOverlayOpen: boolean;
  registerOverlayOpen: () => void;
  registerOverlayClose: () => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);

  const registerOverlayOpen = useCallback(() => setCount((c) => c + 1), []);
  const registerOverlayClose = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  return (
    <OverlayContext.Provider value={{ isOverlayOpen: count > 0, registerOverlayOpen, registerOverlayClose }}>
      {children}
    </OverlayContext.Provider>
  );
}

export function useOverlay() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("useOverlay must be used inside OverlayProvider");
  return ctx;
}

/** Tempel 1 baris ini di komponen modal manapun — otomatis lapor "kebuka" saat
 *  mount, "ketutup" saat unmount. Gak perlu diapa-apain lagi setelah ini. */
export function useRegisterOverlay(isOpen: boolean = true) {
  const { registerOverlayOpen, registerOverlayClose } = useOverlay();
  useEffect(() => {
    if (!isOpen) return;
    registerOverlayOpen();
    return () => registerOverlayClose();
  }, [isOpen, registerOverlayOpen, registerOverlayClose]);
}