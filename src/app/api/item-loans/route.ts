import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { ITEM_LOAN_VIEW_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import { reconcileClosedLoans } from "@/lib/itemLoanSync";

// Throttle auto-rekonsiliasi: cukup 1x per 60 detik per instance server.
let lastReconcileAt = 0;

async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    // ✅ Auto-rekonsiliasi: pinjaman yg unitnya udah kejual (transaksi final) /
    // kepakai service / diambil → otomatis "Terjual" & masuk Riwayat.
    // Aman: transaksi CANCELLED/pending TIDAK ikut ditutup. Best-effort.
    if (Date.now() - lastReconcileAt > 60_000) {
      lastReconcileAt = Date.now();
      try { await reconcileClosedLoans(supabaseAdmin); } catch { /* best-effort */ }
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let q = supabaseAdmin.from("item_loans").select("*").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    // ✅ FIX: backfill serial_number dari unit-nya kalau kolom loan kosong.
    //  Loan lama (mis. hasil revert transaksi / jalur DIPESAN) kadang tak
    //  menyimpan serial_number → unit tampil "Di Pinjam" di Kelola Unit tapi
    //  TAK KETEMU saat dicari-SN di halaman Peminjaman (search cuma cek kolom
    //  serial_number). Diisi di sini supaya dua halaman konsisten.
    const loans = data ?? [];
    const missing = loans.filter((l: any) => !l.serial_number && l.unit_id);
    if (missing.length > 0) {
      const lapIds = [...new Set(missing.filter((l: any) => l.item_type === "LAPTOP").map((l: any) => l.unit_id))];
      const accIds = [...new Set(missing.filter((l: any) => l.item_type === "AKSESORIS").map((l: any) => l.unit_id))];
      const snMap = new Map<string, string>();
      if (lapIds.length > 0) {
        const { data: lu } = await supabaseAdmin.from("laptop_units").select("id, serial_number").in("id", lapIds);
        for (const u of lu ?? []) if (u.serial_number) snMap.set(u.id, u.serial_number);
      }
      if (accIds.length > 0) {
        const { data: au } = await supabaseAdmin.from("accessory_units").select("id, serial_number").in("id", accIds);
        for (const u of au ?? []) if (u.serial_number) snMap.set(u.id, u.serial_number);
      }
      for (const l of loans) {
        if (!l.serial_number && l.unit_id && snMap.has(l.unit_id)) l.serial_number = snMap.get(l.unit_id);
      }
    }
    return NextResponse.json({ success: true, data: loans });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const body = await req.json();
    const { item_type, item_id, unit_id, serial_number, item_name, notes, category, batch_id } = body ?? {};

    if (!item_type || !["LAPTOP", "AKSESORIS"].includes(item_type))
      return NextResponse.json({ success: false, message: "Tipe barang tidak valid" }, { status: 400 });
    if (!item_id) return NextResponse.json({ success: false, message: "Barang wajib dipilih" }, { status: 400 });
    if (!item_name) return NextResponse.json({ success: false, message: "Nama barang kosong" }, { status: 400 });

    if (unit_id) {
      const { data: existing } = await supabaseAdmin
        .from("item_loans")
        .select("id")
        .eq("unit_id", unit_id)
        .in("status", ["PENDING", "APPROVED"])
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { success: false, message: "Unit ini sedang dipinjam atau menunggu persetujuan" },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("item_loans")
      .insert({
        item_type,
        item_id,
        unit_id: unit_id || null,
        serial_number: serial_number || null,
        item_name,
        batch_id: batch_id || null,
        borrower_id: user.id,
        borrower_name: user.name,
        notes: notes || null,
        category: category === "PESANAN" ? "PESANAN" : "KEBUTUHAN",
        status: "PENDING",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    try {
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "CREATE", entity: "item_loan", entityId: data.id,
        entityLabel: `Pinjam ${item_name}${serial_number ? ` (${serial_number})` : ""}`,
        afterData: data,
      });
    } catch { /* logging non-blocking */ }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, ITEM_LOAN_VIEW_ROLES);
export const POST = withAuth(postHandler, ITEM_LOAN_VIEW_ROLES);