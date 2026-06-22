"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

interface Position {
  x: number;
  y: number;
}

interface DraggableFabProps {
  children: ReactNode;
  /** Jarak awal dari tepi kanan (px) sebelum digeser. Default 16 */
  initialRight?: number;
  /** Jarak awal dari tepi bawah (px) sebelum digeser. Default 88 (di atas bottom nav) */
  initialBottom?: number;
  /** Drag hanya aktif di bawah lebar ini (px). Default 768 (breakpoint md) */
  mobileBreakpoint?: number;
  /** Snap ke tepi kiri/kanan setelah dilepas. Default true */
  snapToEdge?: boolean;
  /** Geser minimal (px) supaya dianggap "drag", bukan "tap". Default 8 */
  dragThreshold?: number;
  /** Key localStorage untuk menyimpan posisi terakhir (opsional) */
  storageKey?: string;
  /** Padding minimal dari tepi layar (px). Default 12 */
  edgePadding?: number;
  className?: string;
}

export default function DraggableFab({
  children,
  initialRight = 16,
  initialBottom = 88,
  mobileBreakpoint = 768,
  snapToEdge = true,
  dragThreshold = 8,
  storageKey,
  edgePadding = 12,
  className = "",
}: DraggableFabProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);

  // Refs untuk perhitungan saat drag (tanpa memicu re-render)
  const startPointer = useRef<Position>({ x: 0, y: 0 });
  const startPos = useRef<Position>({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const suppressClickRef = useRef(false);

  // ── Deteksi mobile + mounted (hindari hydration mismatch) ──
  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < mobileBreakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [mobileBreakpoint]);

  // ── Load posisi tersimpan (post-mount → aman dari mismatch) ──
  useEffect(() => {
    if (!mounted || !storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Position;
        if (typeof saved.x === "number" && typeof saved.y === "number") {
          setPos(saved);
        }
      }
    } catch {
      /* ignore */
    }
  }, [mounted, storageKey]);

  const clamp = useCallback(
    (x: number, y: number): Position => {
      const el = nodeRef.current;
      const w = el?.offsetWidth ?? 56;
      const h = el?.offsetHeight ?? 56;
      const maxX = window.innerWidth - w - edgePadding;
      const maxY = window.innerHeight - h - edgePadding;
      return {
        x: Math.min(Math.max(x, edgePadding), Math.max(maxX, edgePadding)),
        y: Math.min(Math.max(y, edgePadding), Math.max(maxY, edgePadding)),
      };
    },
    [edgePadding]
  );

  // ── Jaga posisi tetap di dalam layar saat resize/rotate ──
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos, clamp]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile) return; // desktop: tidak bisa digeser
    const el = nodeRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    startPos.current = { x: rect.left, y: rect.top };
    startPointer.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    suppressClickRef.current = false;

    el.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - startPointer.current.x;
    const dy = e.clientY - startPointer.current.y;

    // Belum lewat threshold → masih dianggap mau "tap", jangan geser dulu
    if (!movedRef.current && Math.hypot(dx, dy) < dragThreshold) return;

    movedRef.current = true;
    e.preventDefault(); // cegah halaman ikut scroll saat menggeser
    setPos(clamp(startPos.current.x + dx, startPos.current.y + dy));
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    const el = nodeRef.current;
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (movedRef.current) {
      // Ini "drag", bukan "tap" → blokir klik supaya chat tidak ikut kebuka
      suppressClickRef.current = true;

      let finalPos = pos ?? startPos.current;

      if (snapToEdge && el) {
        const w = el.offsetWidth;
        const center = finalPos.x + w / 2;
        const snapX =
          center < window.innerWidth / 2
            ? edgePadding
            : window.innerWidth - w - edgePadding;
        finalPos = clamp(snapX, finalPos.y);
        setPos(finalPos);
      }

      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(finalPos));
        } catch {
          /* ignore */
        }
      }
    }
  };

  // Blokir 1x klik tepat setelah drag (capture phase → sebelum sampai ke tombol)
  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  // ── Styling posisi ──
  // pos === null → pakai anchor bottom/right (sama di server & client → no mismatch)
  // pos terisi   → pakai left/top hasil drag
  const style: React.CSSProperties =
    pos && isMobile
      ? {
          left: pos.x,
          top: pos.y,
          right: "auto",
          bottom: "auto",
          touchAction: "none",
          transition: dragging
            ? "none"
            : "left 0.25s cubic-bezier(0.16,1,0.3,1)",
        }
      : {
          right: initialRight,
          bottom: initialBottom,
          touchAction: isMobile ? "none" : "auto",
        };

  return (
    <div
      ref={nodeRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
      className={`fixed z-50 ${dragging ? "cursor-grabbing select-none" : ""} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}