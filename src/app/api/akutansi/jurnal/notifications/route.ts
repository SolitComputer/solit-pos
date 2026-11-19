// src/app/api/akutansi/jurnal/notifications/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── GET /api/akutansi/jurnal/notifications ──────────────────────────────────
// List notif perubahan jurnal yang BELUM di-ack oleh user login.
//
// Filter 2 lapis:
// 1. User harus eligible (ada di journal_notif_recipients dengan enabled=true)
// 2. Notif belum di-ack user ini (tidak ada row di journal_change_notification_reads)
//
// Kalau user tidak eligible → return array kosong (tidak throw error).
// Dipanggil oleh useJurnalChangedNotify setiap 15 detik (polling).
export const GET = withAuth(async (_req, _ctx, user: any) => {
  const supabase = getAdmin();

  // 1. Cek apakah user eligible terima notif
  const { data: recipient } = await supabase
    .from("journal_notif_recipients")
    .select("user_id, enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!recipient || !recipient.enabled) {
    // User tidak di-whitelist atau di-disable → tidak ada notif untuknya
    return NextResponse.json({ success: true, data: [] });
  }

  // 2. Ambil notif yang BELUM di-ack user ini
  // LEFT JOIN journal_change_notification_reads dengan filter user_id = login user,
  // lalu ambil yang NULL (= belum di-ack).
  const { data: notifs, error } = await supabase
    .from("journal_change_notifications")
    .select(`
      id,
      entry_id,
      trigger_type,
      detail_message,
      invoice_number,
      created_at,
      created_by,
      created_by_user:users!journal_change_notifications_created_by_fkey(id, name),
      entry:journal_entries(period, tanggal),
      reads:journal_change_notification_reads!left(user_id)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[GET notifications]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Filter manual di JS: ambil yang user_id login tidak ada di reads
  const pending = (notifs ?? []).filter((n: any) => {
    const reads = Array.isArray(n.reads) ? n.reads : [];
    return !reads.some((r: any) => r.user_id === user.id);
  });

  // Rapikan response: buang field `reads` dari payload
  const data = pending.map((n: any) => ({
    id: n.id,
    entry_id: n.entry_id,
    trigger_type: n.trigger_type,
    detail_message: n.detail_message,
    invoice_number: n.invoice_number,
    created_at: n.created_at,
    created_by_name: n.created_by_user?.name ?? null,
    entry_period: n.entry?.period ?? null,    // ⬅️ BARU — "YYYY-MM" untuk routing "Buka Jurnal"
    entry_tanggal: n.entry?.tanggal ?? null,  // ⬅️ BARU — tanggal persis entry
  }));

  return NextResponse.json({ success: true, data });
}, AKUNTANSI_ROLES);