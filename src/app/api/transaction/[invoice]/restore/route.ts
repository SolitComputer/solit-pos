import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ invoice: string }>;
}

// Status yang boleh di-restore
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

    // ── 2. Kumpulkan semua unit_ids yang terlibat ─────────────────────────
    // Priority: unit_ids array → unit_id → serial_number lookup → transaction_items
    const unitIds: string[] = [];

    if (Array.isArray(transaction.unit_ids) && transaction.unit_ids.length > 0) {
      // Transaksi modern: pakai unit_ids array
      unitIds.push(...transaction.unit_ids.filter(Boolean));
    } else if (transaction.unit_id) {
      // Transaksi dengan single unit_id
      unitIds.push(transaction.unit_id);
    } else if (transaction.serial_number) {
      // Legacy: lookup by serial_number
      const { data: legacyUnit } = await supabase
        .from("laptop_units")
        .select("id")
        .eq("serial_number", transaction.serial_number)
        .single();

      if (legacyUnit?.id) unitIds.push(legacyUnit.id);
    }

    // Fallback tambahan: cek transaction_items jika unit_ids masih kosong
    if (unitIds.length === 0) {
      const { data: txItems } = await supabase
        .from("transaction_items")
        .select("unit_id")
        .eq("invoice_number", invoice);

      for (const item of txItems ?? []) {
        if (item.unit_id && !unitIds.includes(item.unit_id)) {
          unitIds.push(item.unit_id);
        }
      }
    }

    // ── 3. Kembalikan semua unit ke SIAP_JUAL ─────────────────────────────
    const restoredUnitIds: string[] = [];
    const affectedLaptopIds = new Set<string>();

    if (unitIds.length > 0) {
      // Ambil data unit sebelum diupdate (untuk dapat laptop_id-nya)
      const { data: unitsData } = await supabase
        .from("laptop_units")
        .select("id, laptop_id, status")
        .in("id", unitIds);

      for (const unit of unitsData ?? []) {
        if (unit.laptop_id) affectedLaptopIds.add(unit.laptop_id);
      }

      // Update semua unit sekaligus
      const { error: unitErr } = await supabase
        .from("laptop_units")
        .update({
          status: "SIAP_JUAL",
        })
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
    // Hitung ulang qty SIAP_JUAL per laptop_id yang terdampak
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

    // ── 6. Void warranty jika ada (hanya untuk PAID) ──────────────────────
    // RESERVED/HELD/PACKING seharusnya belum punya warranty aktif,
    // tapi tetap cek untuk jaga-jaga
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

export const POST = withAuth(restoreHandler, PERMISSIONS.EDIT_TRANSACTION);