// src/app/api/transaction/[invoice]/restore/route.ts
import { NextRequest, NextResponse } from "next/server";
// ✅ FIX: dulu pakai client anon-key (@/services/supabase), inkonsisten
// dengan rute-rute saudaranya yang pakai supabaseAdmin — cuma bergantung ke
// RLS anon-key yang bisa berubah, bukan bug yang langsung tereksploitasi
// (akses sudah digerbang withAuth di bawah) tapi disamakan untuk konsistensi.
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { cancelOutflowByInvoice, recordOutflow } from "@/lib/accessoryOutflow";
import { revertLoansOnCancel } from "@/lib/itemLoanSync";

interface Props {
  params: Promise<{ invoice: string }>;
}

const RESTORABLE_STATUSES = ["PAID", "RESERVED", "HELD", "PACKING", "PENDING"] as const;
type RestorableStatus = (typeof RESTORABLE_STATUSES)[number];

// ─── MSJ helpers ───────────────────────────────────────────────────────────
// Unit yang dijual lewat Kelompok Minus Siap Jual tetap menyimpan msj_group_id
// setelah terjual (riwayat). Saat transaksinya di-restore/batal, unit itu harus
// balik ke KELOMPOK ASALNYA sebagai MINUS_SIAP_JUAL — bukan SIAP_JUAL — supaya
// tidak nyangkut: tersembunyi dari Data Barang (msj_group_id terisi) tapi juga
// tidak muncul di kelompok (status bukan MINUS_SIAP_JUAL).

// Kembalikan unit laptop ke stok: unit MSJ → MINUS_SIAP_JUAL, unit biasa → BELUM_SIAP.
async function releaseLaptopUnitsToStock(
  unitIds: string[]
): Promise<{ error: string | null; msjGroupIds: string[] }> {
  if (unitIds.length === 0) return { error: null, msjGroupIds: [] };

  const { data: rows, error: selErr } = await supabase
    .from("laptop_units")
    .select("id, msj_group_id")
    .in("id", unitIds);
  if (selErr) return { error: selErr.message, msjGroupIds: [] };

  const msjUnitIds = new Set(
    (rows ?? []).filter((r: any) => r.msj_group_id).map((r: any) => r.id as string)
  );
  const normalIds = unitIds.filter((id) => !msjUnitIds.has(id));
  const msjGroupIds = [
    ...new Set((rows ?? []).map((r: any) => r.msj_group_id).filter(Boolean)),
  ] as string[];

  if (normalIds.length > 0) {
    const { error } = await supabase
      .from("laptop_units")
      // ✅ Setelah di-restore, unit jadi BELUM_SIAP (bukan langsung SIAP_JUAL) —
      // supaya pengelola barang cek/validasi dulu sebelum dijual lagi. BELUM_SIAP
      // tidak masuk daftar hidden di GET /units, jadi unit otomatis muncul lagi.
      .update({ status: "BELUM_SIAP", reserved_by: null, reserved_invoice: null })
      .in("id", normalIds);
    if (error) return { error: error.message, msjGroupIds: [] };
  }

  if (msjUnitIds.size > 0) {
    const { error } = await supabase
      .from("laptop_units")
      .update({ status: "MINUS_SIAP_JUAL", reserved_by: null, reserved_invoice: null })
      .in("id", [...msjUnitIds]);
    if (error) return { error: error.message, msjGroupIds: [] };
  }

  return { error: null, msjGroupIds };
}

// Aksesori ber-SN dari Kelompok MSJ tidak tercatat di accessory_outflows
// (transaction/create meng-klaimnya langsung di accessory_units), jadi
// cancelOutflowByInvoice tidak mengembalikannya. Dikembalikan manual di sini
// via serial_number di transaction_items. Return: id kelompok terdampak.
async function restoreMsjAccessoryUnits(invoice: string): Promise<string[]> {
  const { data: accItems } = await supabase
    .from("transaction_items")
    .select("serial_number")
    .eq("invoice_number", invoice)
    .eq("item_type", "accessory");

  const sns = [
    ...new Set(
      (accItems ?? [])
        .map((it: any) => (it.serial_number ?? "").toString().trim())
        .filter((s: string) => s && s !== "-")
    ),
  ];
  if (sns.length === 0) return [];

  const { data: units, error } = await supabase
    .from("accessory_units")
    .select("id, msj_group_id")
    .in("serial_number", sns)
    .not("msj_group_id", "is", null)
    .neq("status", "MINUS_SIAP_JUAL");
  if (error) {
    console.error("[RESTORE] cari aksesori MSJ gagal:", error.message);
    return [];
  }
  if (!units || units.length === 0) return [];

  const { error: updErr } = await supabase
    .from("accessory_units")
    .update({ status: "MINUS_SIAP_JUAL" })
    .in("id", units.map((u: any) => u.id));
  if (updErr) {
    console.error("[RESTORE] kembalikan aksesori MSJ gagal:", updErr.message);
    return [];
  }

  return [...new Set(units.map((u: any) => u.msj_group_id).filter(Boolean))] as string[];
}

// Buka lagi kelompok yang sudah SOLD karena sekarang punya SN tersedia lagi.
async function reopenMsjGroups(groupIds: string[]) {
  if (groupIds.length === 0) return;
  const { error } = await supabase
    .from("msj_groups")
    .update({ status: "OPEN", sold_at: null, invoice: null })
    .in("id", groupIds)
    .eq("status", "SOLD");
  if (error) console.error("[RESTORE] buka ulang kelompok MSJ gagal:", error.message);
}

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
    const msjGroupIdsToReopen = new Set<string>();

    if (unitIds.length > 0) {
      // Ambil laptop_id sebelum update (untuk recalc parent)
      const { data: unitsData } = await supabase
        .from("laptop_units")
        .select("id, laptop_id, status")
        .in("id", unitIds);

      for (const unit of unitsData ?? []) {
        if (unit.laptop_id) affectedLaptopIds.add(unit.laptop_id);
      }

      // ✅ MSJ: unit dari Kelompok MSJ balik ke kelompoknya (MINUS_SIAP_JUAL),
      // unit biasa tetap SIAP_JUAL seperti sebelumnya.
      const release = await releaseLaptopUnitsToStock(unitIds);
      if (release.error) {
        console.error("[RESTORE] unit update error:", release.error);
        return NextResponse.json(
          { success: false, message: "Gagal mengembalikan status unit: " + release.error },
          { status: 500 }
        );
      }
      release.msjGroupIds.forEach((id) => msjGroupIdsToReopen.add(id));

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

      // ✅ Jangan buru-buru set "SOLD" saat tidak ada SIAP_JUAL — setelah restore
      // unitnya BELUM_SIAP (masih aktif, belum terjual). Kalau masih ada unit
      // non-SOLD, parent = BELUM_SIAP biar tidak desync & tidak hilang dari list.
      let parentStatus = "SOLD";
      if (newQty > 0) {
        parentStatus = "SIAP_JUAL";
      } else {
        const { count: activeCount } = await supabase
          .from("laptop_units")
          .select("id", { count: "exact", head: true })
          .eq("laptop_id", laptopId)
          .neq("status", "SOLD");
        if ((activeCount ?? 0) > 0) parentStatus = "BELUM_SIAP";
      }

      await supabase
        .from("laptops")
        .update({
          qty: newQty,
          status: parentStatus,
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

    // ── 5a1. [BARU] Batalkan order Penyiapan (PREP) yang ter-link ke invoice ini ──
    // Order e-commerce (Shopee/Tokopedia/TikTok/Lazada) saat dibuat otomatis
    // bikin baris `transactions` + meng-isi `preparation_orders.transaction_invoice`
    // (lihat POST /api/preparation). Restore transaksi dulu TIDAK menyentuh
    // preparation sama sekali, jadi order PREP-nya tetap nyangkut dengan status
    // lamanya (mis. SELESAI) di "Semua Penyiapan" walau transaksinya sudah BATAL.
    // Nilai status "DIBATALKAN" + field cancelled_* disamakan PERSIS dengan
    // POST /api/preparation/[id]/cancel supaya konsisten & lolos constraint DB.
    try {
      const { data: linkedPreps } = await supabase
        .from("preparation_orders")
        .select("id, order_number, status")
        .eq("transaction_invoice", invoice);

      // Hanya batalkan yang BELUM dibatalkan — idempotent, aman kalau restore
      // dipanggil ulang / transaksi di-restore berkali-kali.
      const prepsToCancel = (linkedPreps ?? []).filter((p: any) => p.status !== "DIBATALKAN");

      if (prepsToCancel.length > 0) {
        const nowIso = new Date().toISOString();
        const { error: prepCancelErr } = await supabase
          .from("preparation_orders")
          .update({
            status: "DIBATALKAN",
            cancelled_at: nowIso,
            cancelled_by: user.id,
            cancelled_by_name: user.name,
            cancel_reason: `Transaksi ${invoice} di-restore/batal oleh ${user.name}. ${restoreReason}`,
            updated_at: nowIso,
          })
          .eq("transaction_invoice", invoice)
          .neq("status", "DIBATALKAN");

        if (prepCancelErr) {
          console.error("[RESTORE] gagal batalkan preparation ter-link:", prepCancelErr.message);
        } else {
          // Catat di log aktivitas tiap order PREP yang ikut dibatalkan.
          for (const prep of prepsToCancel) {
            await logActivity({
              userId: user.id, userName: user.name, userRole: user.role,
              action: "EDIT", entity: "preparation", entityId: prep.id,
              entityLabel: `${prep.order_number} — DIBATALKAN otomatis (transaksi ${invoice} di-restore)`,
              reason: restoreReason,
            });
          }
        }
      }
    } catch (prepEx: any) {
      // Non-fatal: restore transaksi tetap sukses walau sinkron PREP gagal.
      console.error("[RESTORE] exception saat batalkan preparation:", prepEx?.message ?? prepEx);
    }

    // ── 5a2. REFUND OTOMATIS ke Cashflow (uang keluar di TANGGAL CANCEL) ────
    // HANYA untuk transaksi yang benar-benar LUNAS PENUH (prevStatus === "PAID")
    // sebelum dibatalkan. Transaksi DP / Ambil-Dulu / Packing (RESERVED/HELD/
    // PACKING/PENDING) SENGAJA TIDAK dibuatkan refund otomatis — diurus manual
    // seperti sistem lama. Kenapa: ada kasus customer ambil barang tapi BELUM
    // bayar (piutang) lalu di-cancel; kalau refund tetap dibuat, muncul uang
    // keluar padahal uang masuknya tidak pernah ada → saldo minus palsu.
    // Total refund = total uang yang BENAR-BENAR tercatat masuk untuk invoice
    // ini di Cashflow (TRANSACTION + TRANSACTION_DP + TRANSACTION_PAYMENT),
    // supaya net-nya nol tanpa selisih. Pemasukan aslinya sengaja DIBIARKAN
    // di tanggal aslinya — GET /api/cashflow tidak lagi men-void pemasukan
    // yang invoice-nya sudah punya entry TRANSACTION_REFUND.
    if (prevStatus !== "PAID") {
      console.log(`[RESTORE] skip refund otomatis: status ${prevStatus} (bukan PAID) — invoice ${invoice}`);
    } else try {
      const { data: directIn } = await supabase
        .from("cashflow_entries")
        .select("nominal")
        .in("source_type", ["TRANSACTION", "TRANSACTION_DP"])
        .eq("source_id", invoice);
      let totalReceived = (directIn ?? []).reduce(
        (s, r: any) => s + Math.round(Number(r.nominal ?? 0)),
        0
      );

      // Cicilan: TRANSACTION_PAYMENT.source_id = id baris transaction_payments,
      // jadi harus di-resolve dulu dari invoice → id pembayaran.
      const { data: payRows } = await supabase
        .from("transaction_payments")
        .select("id")
        .eq("invoice_number", invoice);
      const payIds = (payRows ?? []).map((p: any) => p.id as string);
      if (payIds.length > 0) {
        const { data: payIn } = await supabase
          .from("cashflow_entries")
          .select("nominal")
          .eq("source_type", "TRANSACTION_PAYMENT")
          .in("source_id", payIds);
        totalReceived += (payIn ?? []).reduce(
          (s, r: any) => s + Math.round(Number(r.nominal ?? 0)),
          0
        );
      }

      // Idempotent: jangan bikin refund dobel kalau sudah ada.
      const { data: existingRefund } = await supabase
        .from("cashflow_entries")
        .select("id")
        .eq("source_type", "TRANSACTION_REFUND")
        .eq("source_id", invoice)
        .maybeSingle();

      if (totalReceived > 0 && !existingRefund) {
        const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        const refundCategory =
          transaction.item_kind === "accessory" ? "PENJUALAN_AKSESORIS_OUT" : "PENJUALAN_LAPTOP_OUT";
        const { error: refundErr } = await supabase.from("cashflow_entries").insert({
          direction: "OUT",
          category: refundCategory,
          nama: user.name,
          nominal: totalReceived,
          modal: null,
          keterangan: `Refund transaksi batal · ${transaction.customer_name ?? "—"} · ${transaction.laptop_name ?? "—"}`,
          tanggal: jakartaToday,
          source_type: "TRANSACTION_REFUND",
          source_id: invoice,
          payment_method: null,
          is_audited: false,
        });
        if (refundErr) console.error("[RESTORE] buat entry refund cashflow gagal:", refundErr.message);
      }
    } catch (refundEx: any) {
      console.error("[RESTORE] refund cashflow exception:", refundEx?.message ?? refundEx);
    }

    // 5b. Batalkan catatan outflow aksesoris jika ada
    await cancelOutflowByInvoice(invoice);

    // ✅ Peminjaman: pinjaman yang "DIPESAN" karena transaksi ini balik "Dipinjam".
    try { await revertLoansOnCancel(supabase, invoice); } catch { /* best-effort */ }

    // 5c. ✅ MSJ: aksesori ber-SN dari kelompok balik ke MINUS_SIAP_JUAL, lalu
    // kelompok yang sudah SOLD dibuka lagi. Non-fatal: restore tetap sukses.
    try {
      const accGroupIds = await restoreMsjAccessoryUnits(invoice);
      accGroupIds.forEach((id) => msjGroupIdsToReopen.add(id));
      await reopenMsjGroups([...msjGroupIdsToReopen]);
    } catch (msjErr: any) {
      console.error("[RESTORE] sinkron Kelompok MSJ gagal (non-fatal):", msjErr?.message ?? msjErr);
    }

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

    // 2. Kembalikan unit terpilih ke stok — unit MSJ balik ke kelompoknya
    //    (MINUS_SIAP_JUAL), unit biasa ke SIAP_JUAL.
    const release = await releaseLaptopUnitsToStock(selectedUnitIds);
    if (release.error) {
      return NextResponse.json(
        { success: false, message: "Gagal mengembalikan status unit: " + release.error },
        { status: 500 }
      );
    }
    await reopenMsjGroups(release.msjGroupIds);

    // 3. Sync qty & status laptop parent
    for (const laptopId of affectedLaptopIds) {
      const { data: siapUnits } = await supabase
        .from("laptop_units")
        .select("id")
        .eq("laptop_id", laptopId)
        .eq("status", "SIAP_JUAL");
      const newQty = siapUnits?.length ?? 0;

      // ✅ Sama seperti full restore: tidak ada SIAP_JUAL tapi masih ada unit
      // non-SOLD (mis. BELUM_SIAP hasil restore) → parent = BELUM_SIAP.
      let parentStatus = "SOLD";
      if (newQty > 0) {
        parentStatus = "SIAP_JUAL";
      } else {
        const { count: activeCount } = await supabase
          .from("laptop_units")
          .select("id", { count: "exact", head: true })
          .eq("laptop_id", laptopId)
          .neq("status", "SOLD");
        if ((activeCount ?? 0) > 0) parentStatus = "BELUM_SIAP";
      }

      await supabase
        .from("laptops")
        .update({ qty: newQty, status: parentStatus, ready_to_sell: newQty > 0 })
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

    // ✅ FIX: inventory_price & other (margin) dulu tidak pernah direcompute
    // di sini, cuma deal_price/amount. Riwayat Transaksi (list) menghitung
    // margin fresh jadi kelihatan benar, tapi "Lihat Detail" baca kolom
    // `other` langsung dari DB, jadi angkanya beda/basi setelah restore-sebagian.
    let newInventoryPrice = 0;
    if (remainingUnitIds.length > 0) {
      const { data: remainingUnits } = await supabase
        .from("laptop_units")
        .select("id, purchase_price")
        .in("id", remainingUnitIds);
      newInventoryPrice = (remainingUnits ?? []).reduce(
        (sum, u) => sum + Number(u.purchase_price ?? 0),
        0
      );
    }

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
        inventory_price: newInventoryPrice,
        other: finalNewTotal - newInventoryPrice,
        last_edited_by: user.name,
        last_edited_at: new Date().toISOString(),
        notes: transaction.notes ? `${transaction.notes} | ${noteAppend}` : noteAppend,
      })
      .eq("invoice_number", invoice);

    if (updateTxError) {
      return NextResponse.json({ success: false, message: updateTxError.message }, { status: 400 });
    }

    // ✅ Peminjaman: pinjaman "DIPESAN" untuk unit yang direstore sebagian balik "Dipinjam".
    try { await revertLoansOnCancel(supabase, invoice, selectedUnitIds); } catch { /* best-effort */ }

    // 5c. Sinkronkan ulang outflow aksesoris.
    // Partial restore meng-update ulang baris transaksi tanpa menghitung aksesoris,
    // jadi outflow lama (semua unit SSD yg KELUAR) dibatalkan dulu — unit balik
    // TERSEDIA — lalu dicatat ulang HANYA untuk aksesoris yg masih aktif di
    // transaction_items (restored=false). Tanpa ini, unit SSD nyangkut "KELUAR"
    // padahal transaksinya masih jalan.
    await cancelOutflowByInvoice(invoice);
    {
      const { data: activeAccItems } = await supabase
        .from("transaction_items")
        .select("accessory_id, serial_number, quantity")
        .eq("invoice_number", invoice)
        .eq("restored", false)
        .or("item_type.eq.accessory,and(accessory_id.not.is.null,unit_id.is.null)");

      for (const a of activeAccItems ?? []) {
        if (!a.accessory_id) continue;

        let unitId: string | null = null;
        const accSn = a.serial_number && a.serial_number !== "-" ? String(a.serial_number).trim() : null;
        if (accSn) {
          const { data: u } = await supabase
            .from("accessory_units")
            .select("id")
            .eq("serial_number", accSn)
            .maybeSingle();
          unitId = u?.id ?? null;
        }

        await recordOutflow({
          accessory_id: a.accessory_id,
          unit_id: unitId,
          source_type: "transaction",
          transaction_invoice: invoice,
          qty: Number(a.quantity) || 1,
          notes: `Penjualan (Partial Restore) ${invoice}`,
          taken_by_role: "SALES",
        });

        if (unitId) {
          await supabase
            .from("accessory_units")
            .update({ status: "KELUAR" })
            .eq("id", unitId)
            .eq("status", "TERSEDIA");
        }
      }
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