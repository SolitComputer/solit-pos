// src/lib/dynamicPermissions.ts
//
// Layer TAMBAHAN di atas sistem role hardcode (permissions.ts).
// Tidak mengubah perilaku role lama sama sekali — role_key untuk role lama
// (mis. "CREW_SALES") juga bisa punya baris di role_page_permissions kalau
// suatu saat mau dikustom, tapi secara default role lama tetap 100% dikontrol
// oleh ROUTE_PERMISSIONS di permissions.ts seperti sekarang.
//
// Dipakai di: middleware.ts, Sidebar.tsx, api/me/permissions, withAuth() (opsional).

import { createClient } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/withTimeout";

// Sama kayak SUPABASE_TIMEOUT_MS di middleware.ts — batas waktu per query
// biar checkDynamicPageAccess() (dipanggil middleware di HAMPIR SETIAP
// request) gak nge-gantung kalau Supabase lambat/hang.
const SUPABASE_TIMEOUT_MS = 5000;

export type PageAction = "view" | "create" | "edit" | "delete";

export interface AppPage {
  key: string;
  label: string;
  route: string;
  group_label: string;
  sort_order: number;
}

export interface DynamicRole {
  key: string;
  label: string;
  icon: string;
  badge_bg: string;
  badge_text: string;
  badge_border: string;
  is_pkl: boolean;
  parent_role: string | null;
}

export interface RolePermissionRow {
  role_key: string;
  page_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

function getSupabase() {
  // Pakai service role key: dipanggil dari middleware/API server-side saja.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── Cache in-memory sederhana (per proses server) ────────────────────────────
// Kenapa perlu: middleware jalan di HAMPIR SETIAP request, jadi query DB
// langsung tiap request akan lambat & boros. TTL pendek (30 detik) cukup
// untuk kasus ini karena perubahan role/permission tidak butuh real-time.
const CACHE_TTL_MS = 30_000;

let pagesCache: { data: AppPage[]; at: number } | null = null;
let rolesCache: { data: DynamicRole[]; at: number } | null = null;
let permsCache: { data: RolePermissionRow[]; at: number } | null = null;

function isFresh(entry: { at: number } | null): boolean {
  return !!entry && Date.now() - entry.at < CACHE_TTL_MS;
}

/** Panggil ini dari API route setelah create/update/delete supaya perubahan langsung kepakai. */
export function invalidateDynamicPermissionCache() {
  pagesCache = null;
  rolesCache = null;
  permsCache = null;
}

export async function getAppPages(): Promise<AppPage[]> {
  if (isFresh(pagesCache)) return pagesCache!.data;
  const supabase = getSupabase();
  const { data, error } = await withTimeout<{
    data: AppPage[] | null;
    error: { message: string } | null;
  }>(
    supabase
      .from("app_pages")
      .select("key,label,route,group_label,sort_order")
      .order("group_label")
      .order("sort_order"),
    SUPABASE_TIMEOUT_MS,
    { data: null, error: { message: "timeout" } }
  );
  if (error) {
    console.error("[dynamicPermissions] getAppPages error:", error.message);
    return pagesCache?.data ?? [];
  }
  pagesCache = { data: data ?? [], at: Date.now() };
  return pagesCache.data;
}

export async function getDynamicRoles(): Promise<DynamicRole[]> {
  if (isFresh(rolesCache)) return rolesCache!.data;
  const supabase = getSupabase();
  const { data, error } = await withTimeout<{
    data: DynamicRole[] | null;
    error: { message: string } | null;
  }>(
    supabase
      .from("dynamic_roles")
      .select("key,label,icon,badge_bg,badge_text,badge_border,is_pkl,parent_role")
      .order("label"),
    SUPABASE_TIMEOUT_MS,
    { data: null, error: { message: "timeout" } }
  );
  if (error) {
    console.error("[dynamicPermissions] getDynamicRoles error:", error.message);
    return rolesCache?.data ?? [];
  }
  rolesCache = { data: data ?? [], at: Date.now() };
  return rolesCache.data;
}

async function getAllPermissionRows(): Promise<RolePermissionRow[]> {
  if (isFresh(permsCache)) return permsCache!.data;
  const supabase = getSupabase();
  const { data, error } = await withTimeout<{
    data: RolePermissionRow[] | null;
    error: { message: string } | null;
  }>(
    supabase
      .from("role_page_permissions")
      .select("role_key,page_key,can_view,can_create,can_edit,can_delete"),
    SUPABASE_TIMEOUT_MS,
    { data: null, error: { message: "timeout" } }
  );
  if (error) {
    console.error("[dynamicPermissions] getAllPermissionRows error:", error.message);
    return permsCache?.data ?? [];
  }
  permsCache = { data: data ?? [], at: Date.now() };
  return permsCache.data;
}

export async function getRolePermissions(roleKey: string): Promise<RolePermissionRow[]> {
  const all = await getAllPermissionRows();
  return all.filter((r) => r.role_key === roleKey);
}

/**
 * Set daftar UserRole statis (hardcode) supaya kita bisa bedakan
 * "role lama" vs "role dinamis (dibuat via web)".
 * Diisi oleh caller (middleware/auth.ts) dari ALL_ROLES yang sudah ada,
 * supaya file ini tidak perlu import permissions.ts (hindari circular import
 * dan supaya file ini tetap ringan dipakai di edge runtime).
 */
export function isDynamicRole(role: string, staticRoles: readonly string[]): boolean {
  return !staticRoles.includes(role);
}

/** Expand parent role untuk dynamic role (mirip PKL_* -> parent di permissions.ts). */
export async function expandDynamicParents(roles: string[]): Promise<string[]> {
  const dynamicRoles = await getDynamicRoles();
  const parentMap = new Map(dynamicRoles.map((r) => [r.key, r.parent_role]));
  const set = new Set(roles);
  for (const r of roles) {
    const parent = parentMap.get(r);
    if (parent) set.add(parent);
  }
  return Array.from(set);
}

/**
 * Cek apakah salah satu role (effectiveRoles, sudah termasuk hasil expand)
 * punya akses ke suatu action pada halaman yang cocok dengan pathname.
 * Return:
 *  - { matched: true, allowed: boolean } kalau pathname cocok dengan salah satu app_pages
 *  - { matched: false } kalau tidak ada app_pages yang cocok (caller memutuskan default)
 */
export async function checkDynamicPageAccess(
  effectiveRoles: string[],
  pathname: string,
  action: PageAction = "view"
): Promise<{ matched: boolean; configured: boolean; allowed: boolean; page?: AppPage }> {
  const pages = await getAppPages();
  // Pilih match terpanjang (paling spesifik), sama seperti logic ROUTE_PERMISSIONS.
  const matchedPage = pages
    .filter((p) => pathname === p.route || pathname.startsWith(p.route + "/"))
    .sort((a, b) => b.route.length - a.route.length)[0];

  if (!matchedPage) return { matched: false, configured: false, allowed: false };

  const rows = await getAllPermissionRows();
  const relevant = rows.filter(
    (r) => r.page_key === matchedPage.key && effectiveRoles.includes(r.role_key)
  );

  const actionField =
    action === "view" ? "can_view" : action === "create" ? "can_create" : action === "edit" ? "can_edit" : "can_delete";

  // configured: minimal salah satu role user ini sudah pernah eksplisit
  // disimpan lewat UI Role & Hak Akses untuk halaman ini (baris ADA di DB,
  // apapun nilainya) — beda dari "belum pernah diatur sama sekali".
  const configured = relevant.length > 0;
  const allowed = relevant.some((r) => r[actionField] === true);
  return { matched: true, configured, allowed, page: matchedPage };
}

/** Semua permission (per halaman) untuk sekumpulan role — dipakai di /api/me/permissions & Sidebar. */
export async function getPermissionMapForRoles(
  effectiveRoles: string[]
): Promise<Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }>> {
  const rows = await getAllPermissionRows();
  const map: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }> = {};
  for (const row of rows) {
    if (!effectiveRoles.includes(row.role_key)) continue;
    const existing = map[row.page_key] ?? { view: false, create: false, edit: false, delete: false };
    map[row.page_key] = {
      view: existing.view || row.can_view,
      create: existing.create || row.can_create,
      edit: existing.edit || row.can_edit,
      delete: existing.delete || row.can_delete,
    };
  }
  return map;
}

/** Bangun sidebar groups untuk dynamic role dari halaman yang punya can_view = true. */
export async function getDynamicMenuGroups(
  effectiveRoles: string[]
): Promise<{ label: string; items: { name: string; href: string }[] }[]> {
  const pages = await getAppPages();
  const permMap = await getPermissionMapForRoles(effectiveRoles);

  const groups = new Map<string, { name: string; href: string }[]>();
  for (const page of pages) {
    if (!permMap[page.key]?.view) continue;
    const list = groups.get(page.group_label) ?? [];
    list.push({ name: page.label, href: page.route });
    groups.set(page.group_label, list);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}