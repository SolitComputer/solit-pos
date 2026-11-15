// src/app/api/akutansi/jurnal/notif-recipients/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES, AKUNTANSI_MANAGE_ROLES, hasAnyRole, type UserRole } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Role yang eligible terima notif jurnal berubah:
// ADMIN + ACCOUNTING + PKL_ACCOUNTING (per keputusan Rayhan di memory).
const ELIGIBLE_ROLES: UserRole[] = ["ADMIN", "ACCOUNTING", "PKL_ACCOUNTING"];

// ── GET /api/akutansi/jurnal/notif-recipients ───────────────────────────────
// List SEMUA user eligible (role ADMIN/ACCOUNTING/PKL_ACCOUNTING) + status enabled.
// Dipakai oleh modal konfigurasi "Atur Notif" — Rayhan ceklist siapa yang boleh terima notif.
export const GET = withAuth(async () => {
  const supabase = getAdmin();

  // 1. Fetch semua user dengan role eligible
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, name, role, roles")
    .order("name", { ascending: true });

  if (usersErr) {
    console.error("[GET notif-recipients]", usersErr);
    return NextResponse.json({ success: false, message: usersErr.message }, { status: 500 });
  }

  const eligibleUsers = (users ?? []).filter((u: any) => {
    const userRoles: string[] = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role];
    return hasAnyRole(userRoles, ELIGIBLE_ROLES);
  });

  if (eligibleUsers.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // 2. Fetch status enabled per user dari journal_notif_recipients
  const userIds = eligibleUsers.map((u: any) => u.id);
  const { data: recipients } = await supabase
    .from("journal_notif_recipients")
    .select("user_id, enabled")
    .in("user_id", userIds);

  const recipientMap = new Map<string, boolean>(
    (recipients ?? []).map((r: any) => [r.user_id as string, r.enabled as boolean])
  );

  // 3. Merge: list user + enabled flag (default false kalau belum di-whitelist)
  const data = eligibleUsers.map((u: any) => ({
    user_id: u.id,
    name: u.name,
    role: u.role,
    enabled: recipientMap.get(u.id) ?? false,
  }));

  return NextResponse.json({ success: true, data });
}, AKUNTANSI_ROLES);

// ── PUT /api/akutansi/jurnal/notif-recipients ───────────────────────────────
// Update whitelist penerima notif. Rayhan (ADMIN) submit array of
// { user_id, enabled } dari modal konfigurasi.
//
// Logic:
// - UPSERT per user_id — ada → update enabled; tidak ada → insert baru
// - user_id yang TIDAK dikirim di body → tetap seperti sebelumnya (tidak di-touch)
export const PUT = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];

  if (items.length === 0) {
    return NextResponse.json(
      { success: false, message: "items array wajib diisi" },
      { status: 400 }
    );
  }

  // Validasi payload: setiap item harus punya user_id (string) + enabled (boolean)
  type Item = { user_id: string; enabled: boolean };
  const validItems: Item[] = [];
  for (const it of items) {
    if (
      typeof it?.user_id === "string" &&
      it.user_id.trim().length > 0 &&
      typeof it?.enabled === "boolean"
    ) {
      validItems.push({ user_id: it.user_id.trim(), enabled: it.enabled });
    }
  }

  if (validItems.length === 0) {
    return NextResponse.json(
      { success: false, message: "Tidak ada item valid (butuh user_id & enabled)" },
      { status: 400 }
    );
  }

  const supabase = getAdmin();

  // Batch upsert — insert baru atau update enabled flag
  const rows = validItems.map((it) => ({
    user_id: it.user_id,
    enabled: it.enabled,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("journal_notif_recipients")
    .upsert(rows, { onConflict: "user_id" });

  if (error) {
    console.error("[PUT notif-recipients]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `${validItems.length} user updated.`,
    updated_count: validItems.length,
  });
}, AKUNTANSI_MANAGE_ROLES);