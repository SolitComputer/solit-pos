// src/hooks/useAuthUser.ts
"use client";
import { useEffect, useState, useCallback } from "react";
import type { UserRole } from "@/lib/permissions";

interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  roles: UserRole[];
}

// Module-level cache — shared & persistent across components
let _cached: AuthUser | null = null;
let _promise: Promise<AuthUser | null> | null = null;
// Listeners untuk notify semua subscriber saat data berubah
const _listeners = new Set<(u: AuthUser | null) => void>();

async function fetchUser(): Promise<AuthUser | null> {
  if (_cached) return _cached;
  if (_promise) return _promise;

  _promise = fetch("/api/auth/me")
    .then(r => (r.ok ? r.json() : null))
    .then(json => {
      const u = json?.user ?? null;
      if (u) {
        u.roles =
          Array.isArray(u.roles) && u.roles.length > 0
            ? u.roles
            : [u.role].filter(Boolean);
      }
      _cached = u;
      // Notify semua subscriber yang sedang aktif
      _listeners.forEach(fn => fn(_cached));
      return _cached;
    })
    .catch(() => {
      _promise = null; // reset supaya bisa retry
      return null;
    });

  return _promise;
}

/** Invalidate cache — pakai ini setelah logout */
export function invalidateAuthCache() {
  _cached = null;
  _promise = null;
  _listeners.forEach(fn => fn(null));
}

export function useAuthUser() {
  // Langsung pakai _cached kalau sudah ada — tidak perlu tunggu effect
  const [user, setUser] = useState<AuthUser | null>(_cached);
  const [loading, setLoading] = useState<boolean>(!_cached);

  const refresh = useCallback(async () => {
    setLoading(true);
    const u = await fetchUser();
    setUser(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Daftarkan listener supaya dapat update kalau fetch selesai
    // dari komponen lain yang trigger lebih dulu
    const listener = (u: AuthUser | null) => {
      setUser(u);
      setLoading(false);
    };
    _listeners.add(listener);

    // Kalau belum ada cache, trigger fetch
    if (!_cached) {
      void fetchUser();
    } else {
      // Cache sudah ada, langsung set
      setUser(_cached);
      setLoading(false);
    }

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  return { user, loading, refresh };
}