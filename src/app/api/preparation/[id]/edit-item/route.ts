// src/app/api/preparation/[id]/edit-item/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }>; }

// PATCH /api/preparation/[id]/edit-item
// Penyedia mengubah SN / nama item yang SUDAH tersimpan di penyiapan.
// Guard: hanya saat status DIPROSES & item belum dibatalkan. Tidak menyentuh
// stok — murni update catatan di preparation_items.
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const {
      item_id, serial_number, laptop_name,
      item_type, laptop_id, unit_id, accessory_id, accessory_unit_id,
    } = await req.json();

    if (!item_id) return NextResponse.json({ success: false, message: "item_id wajib diisi" }, { status: 400 });
    const sn = String(serial_number ?? "").trim();
    if (!sn) return NextResponse.json({ success: false, message: "Serial number tidak boleh kosong" }, { status: 400 });

    const { data: order } = await supabase
      .from("preparation_orders").select("id, status, order_number").eq("id", id).single();
    if (!order) return NextResponse.json({ success: false, message: "Data penyiapan tidak ditemukan" }, { status: 404 });

    if (order.status !== "DIPROSES") {
      return NextResponse.json(
        { success: false, message: `Hanya bisa edit unit saat status "Diproses" (sekarang "${order.status}")` },
        { status: 400 }
      );
    }

    // Pastikan item memang milik penyiapan ini (cegah edit lintas order).
    const { data: item } = await supabase
      .from("preparation_items").select("id, preparation_id, is_cancelled").eq("id", item_id).single();
    if (!item || item.preparation_id !== id) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan di penyiapan ini" }, { status: 404 });
    }
    if (item.is_cancelled) {
      return NextResponse.json({ success: false, message: "Unit yang sudah dibatalkan tidak bisa diedit" }, { status: 400 });
    }

    // ── Tentukan jenis & id produk ──────────────────────────────────────────
    // Kalau SN dipilih dari stok, frontend sudah kirim id-nya. Kalau diketik
    // manual (id null), resolve sendiri dari serial_number — biar spek tetap
    // ketarik & unit tetap valid saat ditarik ke pembayaran.
    const type: "laptop" | "accessory" = item_type === "accessory" ? "accessory" : "laptop";

    let finalLaptopId: string | null = laptop_id ?? null;
    let finalUnitId: string | null = unit_id ?? null;
    let finalAccessoryId: string | null = accessory_id ?? null;
    let finalAccessoryUnitId: string | null = accessory_unit_id ?? null;

    if (type === "laptop" && (!finalLaptopId || !finalUnitId)) {
      const { data: us } = await supabase
        .from("laptop_units").select("id, laptop_id").eq("serial_number", sn).limit(1);
      const u = us?.[0];
      if (u) {
        finalUnitId = finalUnitId ?? u.id ?? null;
        finalLaptopId = finalLaptopId ?? u.laptop_id ?? null;
      }
    } else if (type === "accessory" && (!finalAccessoryId || !finalAccessoryUnitId)) {
      const { data: as } = await supabase
        .from("accessory_units").select("id, accessory_id").eq("serial_number", sn).limit(1);
      const a = as?.[0];
      if (a) {
        finalAccessoryUnitId = finalAccessoryUnitId ?? a.id ?? null;
        finalAccessoryId = finalAccessoryId ?? a.accessory_id ?? null;
      }
    }

    // Set id jenis-lawan ke null biar nggak nyangkut data unit tipe sebelumnya
    // (mis. dulu laptop, sekarang diganti jadi aksesoris).
    const updates =
      type === "accessory"
        ? {
            serial_number: sn,
            laptop_name: (laptop_name ?? null) || null,
            item_type: "accessory",
            accessory_id: finalAccessoryId,
            accessory_unit_id: finalAccessoryUnitId,
            laptop_id: null,
            unit_id: null,
          }
        : {
            serial_number: sn,
            laptop_name: (laptop_name ?? null) || null,
            item_type: "laptop",
            laptop_id: finalLaptopId,
            unit_id: finalUnitId,
            accessory_id: null,
            accessory_unit_id: null,
          };

    const { data, error } = await supabase
      .from("preparation_items")
      .update(updates)
      .eq("id", item_id)
      .select()
      .single();
    if (error) throw error;

    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "EDIT", entity: "preparation", entityId: id,
      entityLabel: `${order.order_number} — edit unit SN ${sn}`,
    });

    return NextResponse.json({ success: true, data, message: "Unit diperbarui" });
  } catch (err: any) {
    console.error("[PATCH /api/preparation/[id]/edit-item]", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Gagal mengedit unit" }, { status: 500 });
  }
}

export const PATCH = withAuth(patchHandler, PERMISSIONS.DONE_PREPARATION);