import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DELIVERY_PERSON_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

// action: ACCEPT | DECLINE — pengantar setujui / tolak tugas antar
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { action, reason } = await req.json();

    const { data: order } = await supabase
      .from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    // Hanya pengantar yang ditugaskan yang boleh accept/decline
    if (order.delivery_user_id !== user.id)
      return NextResponse.json({ success: false, message: "Tugas ini bukan untuk kamu" }, { status: 403 });
    if (order.status !== "MENUNGGU_PENGANTAR")
      return NextResponse.json({ success: false, message: `Status bukan menunggu persetujuan (${order.status})` }, { status: 400 });

    const now = new Date().toISOString();

    if (action === "ACCEPT") {
      // ✅ SECURITY FIX (TOCTOU): status dicek di atas lalu ditulis terpisah
      // tanpa filter status di UPDATE — dua request bersamaan (mis. accept +
      // decline nyaris bareng) bisa saling menimpa. Sekarang filter status
      // ikut disertakan di WHERE, jadi update cuma sukses kalau status masih
      // sama seperti yang dicek.
      const { data: updatedRows, error } = await supabase
        .from("preparation_orders")
        .update({
          status: "DIKIRIM",
          delivery_accepted_at: now,
          delivery_declined_at: null,
          delivery_decline_reason: null,
          updated_at: now,
        })
        .eq("id", id)
        .eq("status", "MENUNGGU_PENGANTAR")
        .eq("delivery_user_id", user.id)
        .select();
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.json({ success: false, message: "Tugas ini sudah diproses lebih dulu" }, { status: 409 });
      }
      const updated = updatedRows[0];

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — pengantar ${user.name} SETUJU tugas antar`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Tugas diterima, silakan mulai antar" });
    }

    if (action === "DECLINE") {
      // balik ke SIAP_KIRIM biar sales bisa tugaskan ke pengantar lain
      const { data: updatedRows, error } = await supabase
        .from("preparation_orders")
        .update({
          status: "SIAP_KIRIM",
          delivery_user_id: null,
          delivery_user_name: null,
          delivery_method: null,
          delivery_accepted_at: null,
          delivery_declined_at: now,
          delivery_decline_reason: reason ?? null,
          updated_at: now,
        })
        .eq("id", id)
        .eq("status", "MENUNGGU_PENGANTAR")
        .eq("delivery_user_id", user.id)
        .select();
      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        return NextResponse.json({ success: false, message: "Tugas ini sudah diproses lebih dulu" }, { status: 409 });
      }
      const updated = updatedRows[0];

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — pengantar ${user.name} TOLAK tugas antar`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Tugas ditolak, dikembalikan ke sales" });
    }

    return NextResponse.json({ success: false, message: "Action tidak valid" }, { status: 400 });
  } catch (err: any) {
    console.error("[POST accept]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal memproses persetujuan" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DELIVERY_PERSON_ROLES);