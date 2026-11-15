// src/app/api/akutansi/jurnal/notifications/[id]/ack/route.ts
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

// ── POST /api/akutansi/jurnal/notifications/[id]/ack ────────────────────────
// Acknowledge 1 notif — Rayhan klik "OK" di popup.
// Insert row ke journal_change_notification_reads dengan (notification_id, user_id).
// PRIMARY KEY composite → idempotent (klik 2x tidak error, upsert diam-diam).
export const POST = withAuth(async (_req, ctx, user: any) => {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ success: false, message: "ID notif tidak valid" }, { status: 400 });
  }

  const supabase = getAdmin();

  // Cek notif exists dulu — biar kalau ID salah, respon error yang jelas
  const { data: notif, error: fetchErr } = await supabase
    .from("journal_change_notifications")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[POST ack] fetch error:", fetchErr);
    return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
  }
  if (!notif) {
    return NextResponse.json({ success: false, message: "Notif tidak ditemukan" }, { status: 404 });
  }

  // Insert ack. Kalau sudah ada row (klik ulang) → ignore via onConflict.
  const { error } = await supabase
    .from("journal_change_notification_reads")
    .upsert(
      {
        notification_id: id,
        user_id: user.id,
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: "notification_id,user_id", ignoreDuplicates: true }
    );

  if (error) {
    console.error("[POST ack]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_ROLES);