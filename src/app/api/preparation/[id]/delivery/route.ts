import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DELIVERY_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

function todayWIB(): string {
  const nowWIB = new Date(Date.now() + 7 * 3600_000);
  return nowWIB.toISOString().slice(0, 10);
}

interface Props { params: Promise<{ id: string }>; }

// action: START | COMPLETE | RETURN_START | RETURN_COMPLETE
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const { action } = body;

    const { data: order } = await supabase.from("preparation_orders").select("*").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });

    // ✅ SECURITY FIX (hijack pengiriman): dulu START menimpa delivery_user_id
    // jadi si pemanggil tanpa cek pemilik, jadi pengantar lain (sama-sama role
    // PENGANTARAN) bisa merebut order yang sedang diantar orang lain. Kalau
    // order SUDAH punya pengantar, hanya dia yang boleh lanjut. Kalau masih null
    // (antar langsung tanpa flow accept), pemanggil boleh jadi pengantarnya.
    if (order.delivery_user_id && order.delivery_user_id !== user.id) {
      return NextResponse.json(
        { success: false, message: "Pengiriman ini sedang ditangani pengantar lain" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    if (action === "START") {
      if (order.scheduled_delivery_date && order.scheduled_delivery_date > todayWIB()) {
        return NextResponse.json({
          success: false,
          message: `Belum waktunya. Dijadwalkan diantar ${order.scheduled_delivery_date}.`,
        }, { status: 400 });
      }

      if (order.status !== "DIKIRIM")
        return NextResponse.json({ success: false, message: `Status bukan pengiriman (${order.status})` }, { status: 400 });
      if (order.delivery_method !== "PENGANTARAN")
        return NextResponse.json({ success: false, message: "Mulai antar hanya untuk metode pengantaran" }, { status: 400 });

      const { dest_lat, dest_lng, delivery_address, route_polyline, distance_m, duration_s } = body;
      const patch: Record<string, any> = {
        delivery_user_id: user.id, delivery_user_name: user.name,
        delivery_started_at: now, updated_at: now,
        ...(dest_lat != null && { dest_lat: Number(dest_lat) }),
        ...(dest_lng != null && { dest_lng: Number(dest_lng) }),
        ...(delivery_address && { delivery_address }),
        ...(route_polyline && { route_polyline }),
        ...(distance_m != null && { delivery_distance_m: Math.round(distance_m) }),
        ...(duration_s != null && { delivery_duration_s: Math.round(duration_s) }),
      };
      const { data: updated, error } = await supabase
        .from("preparation_orders").update(patch).eq("id", id).select().single();
      if (error) throw error;

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — MULAI diantar oleh ${user.name}`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Pengantaran dimulai" });
    }

    // ── SAMPAI DI CUSTOMER ──
    if (action === "COMPLETE") {
      if (order.status !== "DIKIRIM")
        return NextResponse.json({ success: false, message: `Status bukan pengiriman (${order.status})` }, { status: 400 });
      const { data: updated, error } = await supabase
        .from("preparation_orders")
        .update({
          status: "SELESAI", delivered_at: now, updated_at: now,
          ...(order.delivery_method === "PENGANTARAN" && !order.delivery_user_id
            ? { delivery_user_id: user.id, delivery_user_name: user.name } : {}),
        })
        .eq("id", id).select().single();
      if (error) throw error;

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — TERKIRIM ke customer`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Barang berhasil terkirim" });
    }

    // ── MULAI PERJALANAN PULANG ── (tracking lanjut, fase RETURN)
    if (action === "RETURN_START") {
      if (order.status !== "SELESAI" || order.delivery_method !== "PENGANTARAN")
        return NextResponse.json({ success: false, message: "Belum bisa pulang (harus sudah terkirim & metode pengantaran)" }, { status: 400 });
      if (order.returned_at)
        return NextResponse.json({ success: false, message: "Perjalanan pulang sudah selesai" }, { status: 400 });

      const { data: updated, error } = await supabase
        .from("preparation_orders").update({ return_started_at: now, updated_at: now }).eq("id", id).select().single();
      if (error) throw error;

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — MULAI perjalanan pulang`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Tracking pulang dimulai" });
    }

    // ── SAMPAI KEMBALI DI TOKO ──
    if (action === "RETURN_COMPLETE") {
      if (!order.return_started_at)
        return NextResponse.json({ success: false, message: "Perjalanan pulang belum dimulai" }, { status: 400 });
      const { data: updated, error } = await supabase
        .from("preparation_orders").update({ returned_at: now, updated_at: now }).eq("id", id).select().single();
      if (error) throw error;

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "preparation", entityId: id,
        entityLabel: `${order.order_number} — pengantar SUDAH kembali ke toko`,
        beforeData: order, afterData: updated,
      });
      return NextResponse.json({ success: true, data: updated, message: "Pengantar sudah kembali" });
    }

    return NextResponse.json({ success: false, message: "Action tidak valid" }, { status: 400 });
  } catch (err: any) {
    console.error("[POST delivery]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal update pengiriman" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DELIVERY_ROLES);