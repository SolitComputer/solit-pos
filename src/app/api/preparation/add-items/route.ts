// src/app/api/preparation/[id]/add-items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { DONE_PREPARATION_ROLES } from "@/lib/permissions";
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

    // ── GUARD: cuma boleh nambah saat status DIPROSES ──
    // Disamakan dengan syarat tombol di frontend supaya tidak ada celah.
    if (order.status !== "DIPROSES") {
      return NextResponse.json(
        { success: false, message: `Hanya bisa menambah unit saat status "Diproses" (sekarang "${order.status}")` },
        { status: 400 }
      );
    }

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

export const POST = withAuth(postHandler, DONE_PREPARATION_ROLES);