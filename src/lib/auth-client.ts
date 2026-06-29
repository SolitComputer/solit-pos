// src/lib/auth-client.ts

export interface ClientUser {
  id: string;
  name: string;
  role: string;        // primary role
  roles: string[];     // semua roles
  shift?: "PAGI" | "SORE";
}

export async function getCurrentUserClient(): Promise<ClientUser | null> {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });
    const data = await res.json();
    if (!data.success || !data.user) return null;

    const raw = data.user;

    // ✅ Normalize: JWT lama hanya punya role string, JWT baru punya roles[]
    const roles: string[] =
      Array.isArray(raw.roles) && raw.roles.length > 0
        ? raw.roles
        : [raw.role].filter(Boolean);
    return {
      id: raw.id,
      name: raw.name,
      role: roles[0] ?? raw.role,  // primary role
      roles,
      shift: raw.shift,
    };
  } catch {
    return null;
  }
}