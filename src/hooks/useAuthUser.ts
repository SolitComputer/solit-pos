"use client";
import { useEffect, useState } from "react";
import type { UserRole } from "@/lib/permissions";

interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  roles: UserRole[]; // ✅ tambahkan ini
}

let _cached: AuthUser | null = null;
let _promise: Promise<AuthUser | null> | null = null;

async function fetchUser(): Promise<AuthUser | null> {
  if (_cached) return _cached;
  if (_promise) return _promise;
  _promise = fetch("/api/auth/me")
    .then(r => r.ok ? r.json() : null)
    .then(json => {
      const u = json?.user ?? null;
      if (u) {
        // ✅ Normalize: pastikan roles selalu array yang valid
        u.roles = Array.isArray(u.roles) && u.roles.length > 0
          ? u.roles
          : [u.role].filter(Boolean);
      }
      _cached = u;
      return _cached;
    })
    .catch(() => null);
  return _promise;
}

export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(_cached);
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    if (_cached) { setUser(_cached); setLoading(false); return; }
    fetchUser().then(u => { setUser(u); setLoading(false); });
  }, []);

  return { user, loading };
}