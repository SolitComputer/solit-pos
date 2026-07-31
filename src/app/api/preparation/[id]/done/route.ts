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

    const items = order.preparation_items ?? [];

    // ── Guard double-booking: unit sudah SOLD lewat pesanan/transaksi LAIN ──
    // SN yang sama sengaja boleh dipakai di lebih dari 1 penyiapan sekaligus
    // (lihat units/search-sn). Kalau salah satu penyiapan itu SUDAH lunas
    // duluan (unit-nya sudah SOLD), provider TIDAK BOLEH menandai "Siap
    // Kirim" untuk unit yang sama di penyiapan lain — fisiknya sudah tidak
    // ada. Item ini harus dibatalkan (endpoint items/[itemId]/cancel) dulu
    // sebelum penyiapan ini bisa lanjut.
    const activeUnitIds = [...new Set(
      items.filter((it: any) => !it.is_cancelled && it.unit_id).map((it: any) => it.unit_id)
    )] as string[];

    if (activeUnitIds.length > 0) {
      const { data: soldUnits } = await supabase
        .from("laptop_units")
        .select("serial_number, status")
        .in("id", activeUnitIds)
        .eq("status", "SOLD");

      if (soldUnits && soldUnits.length > 0) {
        const snList = soldUnits.map((u: any) => u.serial_number).join(", ");
        return NextResponse.json({
          success: false,
          message: `SN ${snList} sudah terjual lewat pesanan/transaksi lain. Batalkan unit tersebut dulu sebelum menandai siap kirim.`,
        }, { status: 409 });
      }
    }

    // Semua unit harus sudah dicek
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