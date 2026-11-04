// src/app/api/preparation/[id]/add-items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

// POST /api/preparation/[id]/add-items
// Tim Penyedia Barang menambah unit (khususnya AKSESORIS) ke penyiapan yang
// SEDANG diproses. SENGAJA tidak menyentuh stok / tidak bikin transaksi —
// murni dicatat di preparation_items, sama seperti jalur MANUAL di POST utama.
async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { items } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "Minimal 1 item harus diisi" }, { status: 400 });
    }

    const { data: order } = await supabase
      .from("preparation_orders").select("id, status, order_number").eq("id", id).single();
    if (!order) {
      return NextResponse.json({ success: false, message: "Data penyiapan tidak ditemukan" }, { status: 404 });
    }

    // ── GUARD: boleh nambah saat status DIPROSES atau SIAP_KIRIM ──
    // SIAP_KIRIM ditambahkan supaya aksesoris yang telat diinput sales masih
    // bisa disusulkan sebelum barang benar-benar dikirim. Disamakan dengan
    // syarat tombol di frontend supaya tidak ada celah.
    const ALLOWED_ADD_STATUS = ["DIPROSES", "SIAP_KIRIM", "MENUNGGU_PENGANTAR"];
    if (!ALLOWED_ADD_STATUS.includes(order.status)) {
      return NextResponse.json(
        { success: false, message: `Unit hanya bisa ditambah sebelum barang dikirim (sekarang "${order.status}")` },
        { status: 400 }
      );
    }

    // Kalau order SUDAH SIAP_KIRIM, fase checklist penyedia sudah lewat — item
    // susulan langsung ditandai is_checked = true biar daftar unit tidak
    // terlihat "setengah kecek". Saat masih DIPROSES, biarkan false supaya
    // penyedia tetap mencentangnya manual sebelum "Tandai Siap Kirim".
    const autoChecked = order.status !== "DIPROSES";

    const cleanItems = items
      .map((it: any) => ({
        preparation_id: id,
        serial_number: String(it.serial_number ?? "").trim(),
        item_type: it.item_type === "accessory" ? "accessory" : "laptop",
        laptop_name: it.laptop_name ?? null,
        laptop_id: it.laptop_id ?? null,
        accessory_id: it.accessory_id ?? null,
        unit_id: it.unit_id ?? null,
        accessory_unit_id: it.accessory_unit_id ?? null,
        is_checked: autoChecked,
      }))
      .filter((it) => it.serial_number);

    if (cleanItems.length === 0) {
      return NextResponse.json({ success: false, message: "Serial number tidak boleh kosong" }, { status: 400 });
    }

    const { data: inserted, error } = await supabase
      .from("preparation_items")
      .insert(cleanItems)
      .select();
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — +${cleanItems.length} unit ditambahkan penyedia (${cleanItems.filter(i => i.item_type === "accessory").length} aksesoris)`,
    });

    return NextResponse.json({ success: true, data: inserted, message: `${cleanItems.length} unit ditambahkan` });
  } catch (err: any) {
    console.error("[POST /api/preparation/[id]/add-items]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal menambah unit" }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, PERMISSIONS.DONE_PREPARATION);
