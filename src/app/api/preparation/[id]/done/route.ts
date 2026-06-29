// src/app/api/preparation/[id]/done/route.ts
// Penyedia barang menyelesaikan pengecekan semua unit → status SIAP_KIRIM
// Sales yang nanti tentukan metode pengiriman via /dispatch

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_DONE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    // Support body opsional: catatan dari penyedia
    let notes_from_provider: string | null = null;
    try {
      const body = await req.json();
      notes_from_provider = body?.notes_from_provider ?? null;
    } catch { /* body kosong = ok */ }

    const { data: order } = await supabase
      .from("preparation_orders")
      .select("*, preparation_items(*)")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
    }

    if (order.status !== "DIPROSES") {
      return NextResponse.json({
        success: false,
        message: `Tidak bisa diselesaikan, status sekarang "${order.status}"`,
      }, { status: 400 });
    }

    // Semua unit harus sudah dicek
    const items = order.preparation_items ?? [];
    const allChecked = items.length > 0 && items.every((it: any) => it.is_checked);
    if (!allChecked) {
      const unchecked = items.filter((it: any) => !it.is_checked).length;
      return NextResponse.json({
        success: false,
        message: `Masih ada ${unchecked} unit belum dicek`,
      }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("preparation_orders")
      .update({
        // SIAP_KIRIM = penyedia sudah selesai, menunggu sales konfirmasi pengiriman
        status: "SIAP_KIRIM",
        done_by: user.id,
        done_by_name: user.name,
        done_at: now,
        updated_at: now,
        ...(notes_from_provider ? { notes_from_provider } : {}),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "preparation",
      entityId: id,
      entityLabel: `${order.order_number} — SIAP KIRIM oleh ${user.name}`,
      beforeData: order,
      afterData: data,
    });

    return NextResponse.json({
      success: true,
      data,
      message: "Barang siap! Menunggu Sales konfirmasi metode pengiriman.",
    });
  } catch (err) {
    console.error("[POST /api/preparation/[id]/done]", err);
    return NextResponse.json({ success: false, message: "Gagal menyelesaikan penyiapan" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PREPARATION_DONE_ROLES);