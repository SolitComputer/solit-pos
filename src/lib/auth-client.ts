// src/lib/auth-client.ts

import { getAuthUser, type AuthUser } from "@/hooks/useAuthUser";

export interface ClientUser {
  id: string;
  name: string;
  role: string;        // primary role
  roles: string[];     // semua roles
  shift?: "PAGI" | "SORE";
}

/**
 * Ambil current user dari client side.
 * Delegate ke shared cache di useAuthUser.ts — tidak melakukan fetch terpisah.
 */
export async function getCurrentUserClient(): Promise<ClientUser | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    role: user.roles[0] ?? user.role,
    roles: user.roles as string[],
    shift: user.shift,
  };
}

// Re-export untuk backward compat (beberapa file import AuthUser dari sini)
export type { AuthUser };