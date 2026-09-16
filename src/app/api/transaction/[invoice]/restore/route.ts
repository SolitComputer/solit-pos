// src/app/api/transaction/[invoice]/restore/route.ts
import { NextRequest, NextResponse } from "next/server";
// ✅ FIX: dulu pakai client anon-key (@/services/supabase), inkonsisten
// dengan rute-rute saudaranya yang pakai supabaseAdmin — cuma bergantung ke
// RLS anon-key yang bisa berubah, bukan bug yang langsung tereksploitasi
// (akses sudah digerbang withAuth di bawah) tapi disamakan untuk konsistensi.
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { cancelOutflowByInvoice } from "@/lib/accessoryOutflow";

interface Props {
  params: Promise<{ invoice: string }>;
}

const RESTORABLE_STATUSES = ["PAID", "RESERVED", "HELD", "PACKING", "PENDING"] as const;
type RestorableStatus = (typeof RESTORABLE_STATUSES)[number];

async function restoreHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;
    const body = await req.json().catch(() => ({}));
    const restoreReason = typeof body.reason === "string" ? body.reason.trim() : "";
    // ── Unit yang dipilih user untuk restore sebagian (opsional) ──────────
    const selectedUnitIds: string[] = Array.isArray(body.unit_ids)
      ? body.unit_ids.filter((v: any) => typeof v === "string" && v.trim()).map((v: string) => v.trim())
      : [];

    if (!restoreReason) {
      return NextResponse.json(
        { success: false, message: "Alasan restore wajib diisi" },
        { status: 400 }
      );
    }

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

    // ── 2b. Restore SEBAGIAN — cuma jalan kalau user pilih sebagian unit ──
    if (selectedUnitIds.length > 0 && !selectedUnitIds.every((id) => unitIds.includes(id))) {
      return NextResponse.json(
        { success: false, message: "Unit yang dipilih tidak valid untuk transaksi ini" },
        { status: 400 }
      );
    }

    const isPartialRestore =
      selectedUnitIds.length > 0 && selectedUnitIds.length < unitIds.length;

    if (isPartialRestore) {
      return await handlePartialRestore({
        invoice,
        transaction,
        selectedUnitIds,
        restoreReason,
        user,
      });
    }

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
        .update({ status: "SIAP_JUAL", reserved_by: null, reserved_invoice: null })
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
          ready_to_sell: newQty > 0,
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
        restored_by: user.name,
        restored_at: new Date().toISOString(),
        restore_reason: restoreReason,
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
      reason: restoreReason,
      beforeData: transaction,
    });

    const statusLabel: Record<string, string> = {
      PAID: "Lunas",
      RESERVED: "DP",
      HELD: "Ambil Dulu",
      PACKING: "Packing",
      PENDING: "Pending",
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

// ─── PARTIAL RESTORE — restore sebagian unit, sisanya tetap di transaksi ──
async function handlePartialRestore({
  invoice,
  transaction,
  selectedUnitIds,
  restoreReason,
  user,
}: {
  invoice: string;
  transaction: any;
  selectedUnitIds: string[];
  restoreReason: string;
  user: AuthUser;
}) {
  try {
    // 1. Ambil laptop_id tiap unit yang direstore (buat sync qty parent)
    const { data: unitsToRestore, error: unitsErr } = await supabase
      .from("laptop_units")
      .select("id, laptop_id")
      .in("id", selectedUnitIds);

    if (unitsErr) {
      return NextResponse.json(
        { success: false, message: "Gagal mengambil detail unit: " + unitsErr.message },
        { status: 500 }
      );
    }

    const affectedLaptopIds = new Set<string>();
    for (const u of unitsToRestore ?? []) if (u.laptop_id) affectedLaptopIds.add(u.laptop_id);

    // 2. Kembalikan unit terpilih ke SIAP_JUAL
    const { error: unitErr } = await supabase
      .from("laptop_units")
      .update({ status: "SIAP_JUAL", reserved_by: null, reserved_invoice: null })
      .in("id", selectedUnitIds);

    if (unitErr) {
      return NextResponse.json(
        { success: false, message: "Gagal mengembalikan status unit: " + unitErr.message },
        { status: 500 }
      );
    }

    // 3. Sync qty & status laptop parent
    for (const laptopId of affectedLaptopIds) {
      const { data: siapUnits } = await supabase
        .from("laptop_units")
        .select("id")
        .eq("laptop_id", laptopId)
        .eq("status", "SIAP_JUAL");
      const newQty = siapUnits?.length ?? 0;
      await supabase
        .from("laptops")
        .update({ qty: newQty, status: newQty > 0 ? "SIAP_JUAL" : "SOLD", ready_to_sell: newQty > 0 })
        .eq("id", laptopId);
    }

    // 4. Tandai baris transaction_items sebagai "restored" (BUKAN dihapus),
    // supaya SN-nya tetap tampil di Riwayat Transaksi dengan coretan.
    const { data: removedItems } = await supabase
      .from("transaction_items")
      .select("id, unit_id, serial_number, laptop_name, deal_price")
      .eq("invoice_number", invoice)
      .in("unit_id", selectedUnitIds);

    const { error: markRestoredErr } = await supabase
      .from("transaction_items")
      .update({
        restored: true,
        restored_at: new Date().toISOString(),
        restored_by: user.name,
        restore_reason: restoreReason,
      })
      .eq("invoice_number", invoice)
      .in("unit_id", selectedUnitIds);

    if (markRestoredErr) {
      return NextResponse.json(
        { success: false, message: "Gagal menandai item sebagai direstore: " + markRestoredErr.message },
        { status: 500 }
      );
    }

    const restoredDealTotal = (removedItems ?? []).reduce(
      (sum, it) => sum + Number(it.deal_price ?? 0),
      0
    );
    const restoredSerials = (removedItems ?? []).map((it) => it.serial_number).filter(Boolean);
    const restoredLaptopNames = (removedItems ?? []).map((it) => it.laptop_name).filter(Boolean);

    // 5. Hitung ulang sisa unit_ids, serial_numbers, & total harga deal
    // ✅ FIX: hanya hitung item yang MASIH AKTIF; item yang sudah di-mark restored
    // tetap ada di tabel (untuk ditampilkan dicoret) tapi tidak dihitung ulang di sini.
    const { data: remainingItems } = await supabase
      .from("transaction_items")
      .select("unit_id, serial_number, deal_price")
      .eq("invoice_number", invoice)
      .eq("restored", false);

    const remainingUnitIds = (remainingItems ?? []).map((it) => it.unit_id).filter(Boolean);
    const remainingSerials = (remainingItems ?? []).map((it) => it.serial_number).filter(Boolean);
    const newDealTotal = (remainingItems ?? []).reduce(
      (sum, it) => sum + Number(it.deal_price ?? 0),
      0
    );

    const oldDealPrice = Number(transaction.deal_price ?? transaction.amount ?? 0);
    // Fallback kalau transaction_items lama tidak simpan deal_price per unit lengkap
    const finalNewTotal = newDealTotal > 0 ? newDealTotal : Math.max(0, oldDealPrice - restoredDealTotal);

    const noteAppend = `[PARTIAL RESTORE by ${user.name} — ${new Date().toLocaleString("id-ID")}] ${selectedUnitIds.length} unit direstore (${restoredSerials.join(", ") || "-"}). Alasan: ${restoreReason}`;

    // ✅ FIX: JANGAN strip unit_ids/serial_numbers di baris transaksi. Kalau di-strip,
    // GET route (/api/transaction) tidak akan pernah menemukan unit yang sudah direstore
    // lagi — karena GET route membangun daftar SN dari trx.unit_ids/trx.serial_numbers,
    // bukan langsung dari transaction_items. Akibatnya SN yang direstore malah HILANG
    // total, bukan tampil dicoret seperti yang kita mau.
    // Sumber kebenaran "aktif vs sudah direstore" sekarang HANYA kolom
    // transaction_items.restored — trx.unit_ids/serial_numbers TETAP menyimpan
    // seluruh unit (yang aktif + yang sudah direstore), supaya tetap bisa ditampilkan.
    const { error: updateTxError } = await supabase
      .from("transactions")
      .update({
        deal_price: finalNewTotal,
        amount: finalNewTotal,
        last_edited_by: user.name,
        last_edited_at: new Date().toISOString(),
        notes: transaction.notes ? `${transaction.notes} | ${noteAppend}` : noteAppend,
      })
      .eq("invoice_number", invoice);

    if (updateTxError) {
      return NextResponse.json({ success: false, message: updateTxError.message }, { status: 400 });
    }

    // 6. Log aktivitas — inilah "history" yang kamu minta
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "RESTORE", // ✅ FIX: "PARTIAL_RESTORE" bukan anggota union LogAction,
                          // detail "sebagian" dibedakan lewat entityLabel di bawah
      entity: "transaction",
      entityId: transaction.id,
      entityLabel: `${invoice} — ${transaction.customer_name} [PARTIAL] (restore sebagian: ${restoredLaptopNames.join(", ") || restoredSerials.join(", ")})`,
      reason: restoreReason,
      beforeData: { restored_units: removedItems, deal_price_before: oldDealPrice },
    });

    return NextResponse.json({
      success: true,
      message: `${selectedUnitIds.length} unit berhasil di-restore ke stok. Transaksi ${invoice} tetap berjalan dengan ${remainingUnitIds.length} unit tersisa.`,
      partial: true,
      unitRestored: selectedUnitIds.length,
      remainingUnits: remainingUnitIds.length,
    });
  } catch (error) {
    console.error("[PARTIAL_RESTORE] Error:", error);
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  }
}

export const POST = withAuth(restoreHandler, PERMISSIONS.RESTORE_TRANSACTION);