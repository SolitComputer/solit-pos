import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const minSisa = searchParams.get("minSisa");
    const maxSisa = searchParams.get("maxSisa");

    const query = supabase
      .from("transactions")
      .select(`
        id,
        invoice_number,
        status,
        customer_name,
        customer_phone,
        company_name,
        laptop_name,
        serial_number,
        unit_id,
        unit_ids,
        serial_numbers,
        laptop_id,
        deal_price,
        dp_amount,
        amount,
        payment_method,
        source_platform,
        notes,
        sales_id,
        sales_name,
        created_at,
        paid_at,
        last_edited_by,
        last_edited_at
      `)
      .in("status", status ? [status] : ["RESERVED", "HELD", "PACKING", "PENDING"])
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // ── Rincian aksesori per transaksi ──────────────────────────────────────
    // Query terpisah + defensif: kalau kolom accessory_items tidak ada / gagal,
    // list pending TETAP jalan (hanya tanpa info aksesori).
    const accessoryMap = new Map<string, any[]>();
    try {
      const ids = (data || []).map((t: any) => t.id);
      if (ids.length > 0) {
        const { data: accRows, error: accError } = await supabase
          .from("transactions")
          .select("id, accessory_items")
          .in("id", ids);
        if (accError) {
          console.warn("[pending-orders] accessory_items tidak terbaca:", accError.message);
        } else {
          for (const row of accRows || []) {
            accessoryMap.set(row.id, Array.isArray(row.accessory_items) ? row.accessory_items : []);
          }
        }
      }
    } catch (e) {
      console.warn("[pending-orders] gagal ambil aksesori:", e);
    }

    // ── Hitung sisa pembayaran + hak FU, filter di JS (bukan kolom asli) ──
    const min = minSisa ? Number(minSisa) : null;
    const max = maxSisa ? Number(maxSisa) : null;

    const enriched = (data || [])
      .map((t: any) => {
        const dealTotal = Number(t.deal_price ?? t.amount ?? 0);
        const paid = Number(t.dp_amount ?? 0);
        const sisa_pembayaran = Math.max(0, dealTotal - paid);

        const accessory_items = (accessoryMap.get(t.id) ?? []).map((a: any) => ({
          name: a.name || a.item_name || "Aksesori",
          quantity: Number(a.quantity) || 1,
          serial_number: a.serial_number ? String(a.serial_number) : null,
        }));
        // Tidak ada laptop/unit sama sekali + ada aksesori = transaksi khusus aksesori
        const hasLaptopUnit =
          Boolean(t.unit_id) ||
          Boolean(t.laptop_id) ||
          (Array.isArray(t.unit_ids) && t.unit_ids.length > 0);

        return {
          ...t,
          sisa_pembayaran,
          accessory_items,
          is_accessory_only: !hasLaptopUnit && accessory_items.length > 0,
          can_fu: t.sales_id === user.id,
          pending_type: t.status === "RESERVED" ? "DP" : t.status === "HELD" ? "AMBIL_DULU" : t.status === "PACKING" ? "PACKING" : t.status,
        };
      })
      .filter((t) => {
        if (min !== null && t.sisa_pembayaran < min) return false;
        if (max !== null && t.sisa_pembayaran > max) return false;
        return true;
      });

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[pending-orders]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
  "KEPALA_ZENITH",
  "CREW_SALES",
  "ACCOUNTING",
  "PENGANTARAN",
  "KEPALA_SOTECH",
  "SOTECH",
  "KEPALA_ONPOINT",
  "ONPOINT",
]);