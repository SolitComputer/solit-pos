// src/app/api/transaction/[invoice]/restore/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { cancelOutflowByInvoice } from "@/lib/accessoryOutflow";

interface Props {
  params: Promise<{ invoice: string }>;
}

const RESTORABLE_STATUSES = ["PAID", "RESERVED", "HELD", "PACKING"] as const;
type RestorableStatus = (typeof RESTORABLE_STATUSES)[number];

async function restoreHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;

    // ── 1. Ambil transaksi ────────────────────────────────────────────────
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { success: false, message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    const currentStatus = transaction.status as string;

    if (!RESTORABLE_STATUSES.includes(currentStatus as RestorableStatus)) {
      return NextResponse.json(
        {
          success: false,
          message: `Transaksi dengan status "${currentStatus}" tidak bisa di-restore`,
        },
        { status: 400 }
      );
    }

    // ── 2. Kumpulkan SEMUA unit_id dari SEMUA sumber (MERGE, bukan prioritas) ──
    // FIX BUG: dulu pakai priority chain, jadi kalau unit_ids stale (mis. setelah
    // "Tukar SN") unit yang benar-benar TERJUAL tidak ikut ter-restore.
    // Sekarang: gabung unit_ids + unit_id + transaction_items + lookup serial_number,
    // dedupe, lalu SEMUA di-set SIAP_JUAL.
    const unitIdSet = new Set<string>();

    // (a) unit_ids array modern
    if (Array.isArray(transaction.unit_ids)) {
      for (const uid of transaction.unit_ids) if (uid) unitIdSet.add(uid);
    }
    // (b) single unit_id (legacy single-unit)
    if (transaction.unit_id) unitIdSet.add(transaction.unit_id);

    // (c) transaction_items — sumber per-unit paling reliable
    const { data: txItems } = await supabase
      .from("transaction_items")
      .select("unit_id, serial_number")
      .eq("invoice_number", invoice);

    const snCandidates: string[] = [];
    for (const item of txItems ?? []) {
      if (item.unit_id) unitIdSet.add(item.unit_id);
      if (item.serial_number) snCandidates.push(item.serial_number);
    }

    // (d) resolusi via serial_number (legacy + backfill kalau unit_id item kosong)
    if (Array.isArray(transaction.serial_numbers)) {
      snCandidates.push(...transaction.serial_numbers);
    }
    if (transaction.serial_number) snCandidates.push(transaction.serial_number);

    const cleanSNs = [
      ...new Set(
        snCandidates.map((s) => (s ?? "").toString().trim()).filter(Boolean)
      ),
    ];

    if (cleanSNs.length > 0) {
      const { data: unitsBySN, error: snErr } = await supabase
        .from("laptop_units")
        .select("id")
        .in("serial_number", cleanSNs);
      if (snErr) console.error("[RESTORE] lookup SN → id gagal:", snErr.message);
      for (const u of unitsBySN ?? []) if (u.id) unitIdSet.add(u.id);
    }

    const unitIds = [...unitIdSet];

    // ── 3. Kembalikan semua unit ke SIAP_JUAL ─────────────────────────────
    const restoredUnitIds: string[] = [];
    const affectedLaptopIds = new Set<string>();

    if (unitIds.length > 0) {
      // Ambil laptop_id sebelum update (untuk recalc parent)
      const { data: unitsData } = await supabase
        .from("laptop_units")
        .select("id, laptop_id, status")
        .in("id", unitIds);

      for (const unit of unitsData ?? []) {
        if (unit.laptop_id) affectedLaptopIds.add(unit.laptop_id);
      }

      const { error: unitErr } = await supabase
        .from("laptop_units")
        .update({ status: "SIAP_JUAL" })
        .in("id", unitIds);

      if (unitErr) {
        console.error("[RESTORE] unit update error:", unitErr);
        return NextResponse.json(
          { success: false, message: "Gagal mengembalikan status unit: " + unitErr.message },
          { status: 500 }
        );
      }

      restoredUnitIds.push(...unitIds);
    }

    // ── 4. Sync qty & status laptop parent ───────────────────────────────
    for (const laptopId of affectedLaptopIds) {
      const { data: siapUnits } = await supabase
        .from("laptop_units")
        .select("id")
        .eq("laptop_id", laptopId)
        .eq("status", "SIAP_JUAL");

      const newQty = siapUnits?.length ?? 0;

      await supabase
        .from("laptops")
        .update({
          qty: newQty,
          status: newQty > 0 ? "SIAP_JUAL" : "SOLD",
        })
        .eq("id", laptopId);
    }

    // ── 5. Update status transaksi → CANCELLED ────────────────────────────
    const prevStatus = currentStatus;
    const { error: updateTxError } = await supabase
      .from("transactions")
      .update({
        status: "CANCELLED",
        last_edited_by: user.name,
        last_edited_at: new Date().toISOString(),
        notes: transaction.notes
          ? `${transaction.notes} | [RESTORED from ${prevStatus} by ${user.name}]`
          : `[RESTORED from ${prevStatus} by ${user.name}]`,
      })
      .eq("invoice_number", invoice);

    if (updateTxError) {
      return NextResponse.json(
        { success: false, message: updateTxError.message },
        { status: 400 }
      );
    }

    // 5b. Batalkan catatan outflow aksesoris jika ada
    await cancelOutflowByInvoice(invoice);

    // ── 6. Void warranty jika ada ─────────────────────────────────────────
    let warrantyVoided = false;
    const { data: warranty } = await supabase
      .from("warranties")
      .select("id")
      .eq("invoice_number", invoice)
      .single();

    if (warranty) {
      await supabase
        .from("warranties")
        .update({
          status: "VOID",
          last_edited_by: user.name,
          last_edited_at: new Date().toISOString(),
          notes: `[VOID - transaksi di-restore dari ${prevStatus} oleh ${user.name}]`,
        })
        .eq("id", warranty.id);

      warrantyVoided = true;
    }

    // ── 7. Log aktivitas ──────────────────────────────────────────────────
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "RESTORE",
      entity: "transaction",
      entityId: transaction.id,
      entityLabel: `${invoice} — ${transaction.customer_name} (dari ${prevStatus})`,
      beforeData: transaction,
    });

    // ── 8. Response ───────────────────────────────────────────────────────
    const statusLabel: Record<string, string> = {
      PAID: "Lunas",
      RESERVED: "DP",
      HELD: "Ambil Dulu",
      PACKING: "Packing",
    };

    return NextResponse.json({
      success: true,
      message: `Transaksi berhasil di-restore dari status ${statusLabel[prevStatus] ?? prevStatus}. ${restoredUnitIds.length} unit dikembalikan ke stok.`,
      prev_status: prevStatus,
      unitRestored: restoredUnitIds.length,
      warrantyVoided: warrantyVoided,
    });
  } catch (error) {
    console.error("[RESTORE] Error:", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}

export const POST = withAuth(restoreHandler, PERMISSIONS.RESTORE_TRANSACTION);