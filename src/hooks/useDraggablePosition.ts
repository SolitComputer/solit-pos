// src/hooks/useDraggablePosition.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface Position {
  x: number;
  y: number;
}

const SIZE = 44; // px — ukuran bubble notifikasi (dikecilkan dari 52)
const MARGIN = 8;
const SNAP_DURATION_MS = 260;

function clampY(y: number): number {
  if (typeof window === "undefined") return y;
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return Math.min(Math.max(y, MARGIN), maxY);
}

function clampX(x: number): number {
  if (typeof window === "undefined") return x;
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  return Math.min(Math.max(x, MARGIN), maxX);
}

function clamp(pos: Position): Position {
  return { x: clampX(pos.x), y: clampY(pos.y) };
}

/** Snap horizontal ke sisi terdekat (kiri/kanan) — seperti bubble chat Messenger. */
function snapToEdge(pos: Position): Position {
  if (typeof window === "undefined") return pos;
  const centerX = pos.x + SIZE / 2;
  const isLeftHalf = centerX < window.innerWidth / 2;
  const x = isLeftHalf ? MARGIN : window.innerWidth - SIZE - MARGIN;
  return { x, y: clampY(pos.y) };
}

function defaultPosition(): Position {
  if (typeof window === "undefined") return { x: MARGIN, y: 72 };
  return snapToEdge({ x: window.innerWidth - SIZE - MARGIN, y: 72 });
}

/**
 * Posisi bubble mengambang yang bisa digeser bebas (mouse & touch),
 * tapi otomatis snap balik ke sisi tepi (kiri/kanan) terdekat saat dilepas,
 * supaya tidak "nyangkut" berantakan di tengah layar.
 */
export function useDraggablePosition(storageKey: string) {
  const [pos, setPos] = useState<Position>(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const posRef = useRef(pos);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  // Hydrate posisi tersimpan setelah mount (hindari mismatch SSR/CSR)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const next = raw ? snapToEdge(clamp(JSON.parse(raw))) : defaultPosition();
      setPos(next);
    } catch {
      setPos(defaultPosition());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Jaga bubble tetap nempel & di dalam layar saat window resize / rotate device
  useEffect(() => {
    const onResize = () => setPos((p) => snapToEdge(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    };
  }, []);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    setIsSnapping(false);
    draggingRef.current = true;
    movedRef.current = false;
    setIsDragging(true);
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: posRef.current.x,
      posY: posRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    // Selama drag: bebas ke mana saja (termasuk tengah), cukup dibatasi biar tidak keluar layar
    setPos(clamp({ x: startRef.current.posX + dx, y: startRef.current.posY + dy }));
  }, []);

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);

      // Setelah dilepas: snap balik rapi ke sisi tepi terdekat
      const snapped = snapToEdge(posRef.current);
      setIsSnapping(true);
      setPos(snapped);
      try {
        localStorage.setItem(storageKey, JSON.stringify(snapped));
      } catch {
        // localStorage tidak tersedia — posisi cukup bertahan selama sesi (state React)
      }

      snapTimeoutRef.current = setTimeout(() => setIsSnapping(false), SNAP_DURATION_MS);
    },
    [storageKey]
  );

  /** true kalau gesture terakhir adalah drag (geser), bukan klik biasa. */
  const wasDragged = useCallback(() => movedRef.current, []);

  return {
    pos,
    isDragging,
    isSnapping,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    wasDragged,
  };
}