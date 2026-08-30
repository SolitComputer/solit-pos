// src/hooks/usePagePermission.ts
//
// Contoh pakai di komponen halaman (mis. LaptopsContent.tsx):
//
//   const { can, loading } = usePagePermission("data-barang");
//   {can.create && <button onClick={openAddModal}>Tambah Laptop</button>}
//   {can.delete && <button onClick={...}>Hapus</button>}
//
// Untuk role LAMA (statis) yang sudah dicek via PERMISSIONS.* di server,
// hook ini akan selalu return semua true kalau halaman tsb tidak ada baris
// permission dinamisnya (fallback aman: role lama tidak dibatasi hook ini).
"use client";

import { useEffect, useState } from "react";

interface PermSet {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

const FALLBACK_NONE: PermSet = { view: false, create: false, edit: false, delete: false };

export function usePagePermission(pageKey: string) {
    const [can, setCan] = useState<PermSet>(FALLBACK_NONE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me/permissions");
        const data = await res.json();
        if (!alive) return;
        if (data.success && data.permissions[pageKey]) {
          setCan(data.permissions[pageKey]);
               } else {
          // Tidak ada entri dinamis untuk halaman ini -> jangan MENAMBAH izin apa pun.
          // Static role check (hasAnyRole(...) di komponen) yang tetap menentukan sendiri.
          setCan(FALLBACK_NONE);
        }
           } catch {
        if (alive) setCan(FALLBACK_NONE);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pageKey]);

  return { can, loading };
}