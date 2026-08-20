import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { recordOutflow, cancelOutflowByInvoice } from "@/lib/accessoryOutflow";

const STATUS_TO_UNIT_STATUS: Record<string, string> = {
  RESERVED: "RESERVED",
  HELD: "HELD",
  PACKING: "PACKING",
  PAID: "SOLD",
};

interface Props {
  params: Promise<{ invoice: string }>;
}

// ── Helper: set status unit by ID (primary) ──────────────────────────────────
// Mengembalikan boolean supaya kegagalan write TIDAK ditelan diam-diam.
async function setUnitStatusById(
  unitId: string,
  status: "SIAP_JUAL" | "SOLD"
): Promise<boolean> {
  const { error } = await supabase
    .from("laptop_units")
    .update({ status })
    .eq("id", unitId);

  if (error) {
    console.error(`[setUnitStatusById] gagal set ${status} untuk ID ${unitId}:`, error.message);
    return false;
  }
  return true;
}

// ── Helper: set status unit by SN (fallback legacy) ──────────────────────────
async function setUnitStatus(sn: string, status: "SIAP_JUAL" | "SOLD") {
  const { error } = await supabase
    .from("laptop_units")
    .update({ status })
    .eq("serial_number", sn);

  if (error) {
    console.error(`[setUnitStatus] gagal set ${status} untuk SN ${sn}:`, error.message);
  }
}

// ── Helper: recalculate qty & status laptop parent ────────────────────────────
async function syncLaptopParentStats(laptopIds: string[]) {
  if (laptopIds.length === 0) return;

  for (const laptopId of laptopIds) {
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

    console.log(`[syncLaptopParentStats] laptop ${laptopId} → qty=${newQty}, status=${newQty > 0 ? "SIAP_JUAL" : "SOLD"}`);
  }
}

// ── Helper: lepas SEMUA unit sebuah transaksi kembali ke stok ─────────────────
// Dipakai saat transaksi dibatalkan (status → CANCELLED) via PUT, supaya stok
// tidak hilang permanen. Mengumpulkan unit dari semua sumber (unit_ids, unit_id,
// transaction_items, serial_number) seperti endpoint /restore.
async function releaseTransactionUnits(before: any, invoice: string) {
  const unitIdSet = new Set<string>();
  if (Array.isArray(before?.unit_ids)) for (const u of before.unit_ids) if (u) unitIdSet.add(u);
  if (before?.unit_id) unitIdSet.add(before.unit_id);

  const { data: txItems } = await supabase
    .from("transaction_items")
    .select("unit_id, serial_number")
    .eq("invoice_number", invoice);

  const sns: string[] = [];
  for (const it of txItems ?? []) {
    if (it.unit_id) unitIdSet.add(it.unit_id);
    if (it.serial_number) sns.push(it.serial_number);
  }
  if (Array.isArray(before?.serial_numbers)) sns.push(...before.serial_numbers);
  if (before?.serial_number) sns.push(before.serial_number);

  const cleanSNs = [...new Set(sns.map((s) => (s ?? "").toString().trim()).filter(Boolean))];
  if (cleanSNs.length > 0) {
    const { data } = await supabase.from("laptop_units").select("id").in("serial_number", cleanSNs);
    for (const u of data ?? []) if (u.id) unitIdSet.add(u.id);
  }

  const unitIds = [...unitIdSet];
  if (unitIds.length === 0) return;

  const { data: unitsData } = await supabase
    .from("laptop_units")
    .select("laptop_id")
    .in("id", unitIds);
  const laptopIds = [
    ...new Set((unitsData ?? []).map((u) => u.laptop_id).filter(Boolean)),
  ] as string[];

  await supabase
    .from("laptop_units")
    .update({ status: "SIAP_JUAL", reserved_by: null, reserved_invoice: null })
    .in("id", unitIds);

  await syncLaptopParentStats(laptopIds);
}

// ── Helper: resolusi laptop_units.id dari campuran unit_id + serial_number ─────
// Kalau ada unit_id kosong/hilang (kasus umum saat "Tukar SN"), di-backfill dari
// serial_number supaya unit tidak "hilang" dari diff status.
async function resolveUnitIds(
  ids: (string | null | undefined)[],
  sns: (string | null | undefined)[]
): Promise<string[]> {
  const resolved = new Set<string>();

  for (const id of ids) {
    const clean = (id ?? "").toString().trim();
    if (clean) resolved.add(clean);
  }

  const cleanSNs = [
    ...new Set(
      sns.map((s) => (s ?? "").toString().trim()).filter((s) => s.length > 0)
    ),
  ];

  if (cleanSNs.length > 0) {
    const { data: unitsBySN, error } = await supabase
      .from("laptop_units")
      .select("id, serial_number")
      .in("serial_number", cleanSNs);

    if (error) console.error("[resolveUnitIds] gagal lookup SN → id:", error.message);
    for (const u of unitsBySN ?? []) {
      if (u.id) resolved.add(u.id);
    }
  }

  return [...resolved];
}

// ── Sync by unit_ids (modern — primary path) ──────────────────────────────────
// Dipanggil saat form kirim unit_ids (array UUID).
// FIX bug "Tukar SN": backfill id dari serial_number, jadi unit baru yang unit_id-nya
// sempat kosong tetap ke-resolve dan ditandai TERJUAL.
async function syncUnitStatusesByIds(
  oldIds: string[],
  newIds: string[],
  oldSNs: string[] = [],
  newSNs: string[] = []
) {
  const cleanOld = await resolveUnitIds(oldIds, oldSNs);
  const cleanNew = await resolveUnitIds(newIds, newSNs);

  const oldSet = new Set(cleanOld);
  const newSet = new Set(cleanNew);

  // Unit lama yang tidak ada di list baru → kembalikan ke stok
  const toRelease = cleanOld.filter((id) => !newSet.has(id));
  // Unit baru yang tidak ada di list lama → tandai terjual
  const toMark = cleanNew.filter((id) => !oldSet.has(id));

  if (toRelease.length === 0 && toMark.length === 0) {
    console.log("[syncUnitStatusesByIds] Tidak ada perubahan unit, skip sync.");
    return;
  }

  console.log("[syncUnitStatusesByIds] toRelease:", toRelease, "toMark:", toMark);

  // Update status di laptop_units — sekarang track hasil sukses/gagalnya
  const results = await Promise.all([
    ...toRelease.map((id) => setUnitStatusById(id, "SIAP_JUAL")),
    ...toMark.map((id) => setUnitStatusById(id, "SOLD")),
  ]);

  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`[syncUnitStatusesByIds] ${failed} update status unit GAGAL — cek RLS/constraint.`);
  }

  // Kumpulkan semua laptop_id yang terdampak untuk recalculate parent
  const affectedUnitIds = [...toRelease, ...toMark];
  const { data: affectedUnits } = await supabase
    .from("laptop_units")
    .select("laptop_id")
    .in("id", affectedUnitIds);

  const affectedLaptopIds = [
    ...new Set(
      (affectedUnits ?? [])
        .map((u: { laptop_id: string }) => u.laptop_id)
        .filter(Boolean)
    ),
  ];

  // Recalculate qty & status laptop parent
  await syncLaptopParentStats(affectedLaptopIds);
}

// ── Resolusi unit BARU — SN adalah sumber kebenaran, TIDAK di-union dengan
// unit_ids lama supaya unit yang sudah ditukar tidak "nyangkut" dianggap tetap ada.
async function resolveNewUnitIds(
  ids: (string | null | undefined)[],
  sns: (string | null | undefined)[]
): Promise<string[]> {
  const cleanSNs = [
    ...new Set(sns.map((s) => (s ?? "").toString().trim()).filter((s) => s.length > 0)),
  ];

  if (cleanSNs.length > 0) {
    const { data: unitsBySN, error } = await supabase
      .from("laptop_units")
      .select("id, serial_number")
      .in("serial_number", cleanSNs);

    if (error) console.error("[resolveNewUnitIds] gagal lookup SN → id:", error.message);

    const resolved = new Set<string>();
    for (const u of unitsBySN ?? []) if (u.id) resolved.add(u.id);
    return [...resolved];
  }

  // Tidak ada SN dikirim → fallback pakai unit_ids langsung.
  const resolved = new Set<string>();
  for (const id of ids) {
    const clean = (id ?? "").toString().trim();
    if (clean) resolved.add(clean);
  }
  return [...resolved];
}

// ── Fix utama: sinkronkan SEMUA unit yang masih jadi bagian transaksi ke
// status transaksi yang sebenarnya (bukan hard-code "TERJUAL"), dan lepas
// unit yang sudah tidak ikut ke SIAP_JUAL. Dipanggil setiap kali status
// transaksi berubah — TERLEPAS apakah unit_ids ikut dikirim atau tidak.
async function applyFinalUnitStatuses(
  releasedIds: string[],
  activeIds: string[],
  activeStatus: string
) {
  if (releasedIds.length === 0 && activeIds.length === 0) return;

  if (releasedIds.length > 0) {
    const { error } = await supabase
      .from("laptop_units")
      .update({ status: "SIAP_JUAL", reserved_by: null, reserved_invoice: null })
      .in("id", releasedIds);
    if (error) console.error("[applyFinalUnitStatuses] gagal release unit:", error.message);
  }

  if (activeIds.length > 0) {
    const { error } = await supabase
      .from("laptop_units")
      .update({ status: activeStatus })
      .in("id", activeIds);
    if (error) console.error(`[applyFinalUnitStatuses] gagal set status ${activeStatus}:`, error.message);
  }

  const affectedUnitIds = [...releasedIds, ...activeIds];
  const { data: affectedUnits } = await supabase
    .from("laptop_units")
    .select("laptop_id")
    .in("id", affectedUnitIds);

  const affectedLaptopIds = [
    ...new Set((affectedUnits ?? []).map((u: { laptop_id: string }) => u.laptop_id).filter(Boolean)),
  ];

  await syncLaptopParentStats(affectedLaptopIds);
}

async function syncUnitStatusesByFinalIds(toRelease: string[], toMark: string[]) {
  if (toRelease.length === 0 && toMark.length === 0) return;

  const results = await Promise.all([
    ...toRelease.map((id) => setUnitStatusById(id, "SIAP_JUAL")),
    ...toMark.map((id) => setUnitStatusById(id, "SOLD")),
  ]);

  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`[syncUnitStatusesByFinalIds] ${failed} update status unit GAGAL — cek RLS/constraint.`);
  }

  const affectedUnitIds = [...toRelease, ...toMark];
  const { data: affectedUnits } = await supabase
    .from("laptop_units")
    .select("laptop_id")
    .in("id", affectedUnitIds);

  const affectedLaptopIds = [
    ...new Set((affectedUnits ?? []).map((u: { laptop_id: string }) => u.laptop_id).filter(Boolean)),
  ];

  await syncLaptopParentStats(affectedLaptopIds);
}

async function reconcileTransactionItems(
  invoice: string,
  transactionId: string,
  finalUnitIds: string[],
  dealPricesPerUnit: Array<{ unit_id?: string; serial_number?: string; deal_price: number }>
) {
  if (!transactionId) {
    console.error("[reconcileTransactionItems] transactionId kosong, skip — cek pemanggilan before?.id");
    return;
  }

  const { data: currentItems, error: fetchErr } = await supabase
    .from("transaction_items")
    .select("unit_id")
    .eq("invoice_number", invoice)
    .not("unit_id", "is", null);
  if (fetchErr) console.error("[reconcileTransactionItems] gagal ambil item existing:", fetchErr.message);

  const currentIds = new Set((currentItems ?? []).map((it: any) => it.unit_id));
  const finalSet = new Set(finalUnitIds);

  // Hapus baris unit yang sudah tidak jadi bagian transaksi (termasuk sisa data lama/stale)
  const staleIds = [...currentIds].filter((id) => !finalSet.has(id));
  if (staleIds.length > 0) {
    const { error } = await supabase
      .from("transaction_items")
      .delete()
      .eq("invoice_number", invoice)
      .in("unit_id", staleIds);
    if (error) console.error("[reconcileTransactionItems] gagal hapus item stale:", error.message);
  }

  // Buat baris untuk unit final yang belum punya baris transaction_items
  const missingIds = finalUnitIds.filter((id) => !currentIds.has(id));
  if (missingIds.length > 0) {
    const { data: newUnits, error: unitErr } = await supabase
      .from("laptop_units")
      .select("id, serial_number, laptop_id, selling_price, laptop:laptops(laptop_name)")
      .in("id", missingIds);
    if (unitErr) console.error("[reconcileTransactionItems] gagal ambil data unit:", unitErr.message);

    const rows = (newUnits ?? []).map((u: any) => {
      const matched = dealPricesPerUnit.find(
        (p) => p.unit_id === u.id || (p.serial_number && p.serial_number === u.serial_number)
      );
      const dealPrice =
        matched && Number.isFinite(Number(matched.deal_price))
          ? Math.round(Number(matched.deal_price))
          : Math.round(Number(u.selling_price ?? 0));

      return {
        transaction_id: transactionId,
        invoice_number: invoice,
        unit_id: u.id,
        laptop_id: u.laptop_id,
        laptop_name: u.laptop?.laptop_name ?? null,
        serial_number: u.serial_number,
        deal_price: dealPrice,
        selling_price: u.selling_price ?? 0,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase.from("transaction_items").insert(rows);
      if (error) console.error("[reconcileTransactionItems] gagal insert item baru:", error.message);
    }
  }
}

// ── Sync by serial_numbers (legacy fallback) ──────────────────────────────────
// Dipanggil hanya untuk transaksi lama yang tidak punya unit_ids
async function syncUnitStatuses(oldSNs: string[], newSNs: string[]) {
  const oldSet = new Set(oldSNs);
  const newSet = new Set(newSNs);

  const toRelease = oldSNs.filter((sn) => sn && !newSet.has(sn));
  const toMark = newSNs.filter((sn) => sn && !oldSet.has(sn));

  if (toRelease.length === 0 && toMark.length === 0) return;

  console.log("[syncUnitStatuses] toRelease:", toRelease, "toMark:", toMark);

  await Promise.all([
    ...toRelease.map((sn) => setUnitStatus(sn, "SIAP_JUAL")),
    ...toMark.map((sn) => setUnitStatus(sn, "SOLD")),
  ]);

  // Ambil laptop_id dari SN yang terdampak lalu recalculate parent
  const allSNs = [...toRelease, ...toMark];
  const { data: affectedUnits } = await supabase
    .from("laptop_units")
    .select("laptop_id")
    .in("serial_number", allSNs);

  const affectedLaptopIds = [
    ...new Set(
      (affectedUnits ?? [])
        .map((u: { laptop_id: string }) => u.laptop_id)
        .filter(Boolean)
    ),
  ];

  await syncLaptopParentStats(affectedLaptopIds);
}

// ── GET /api/transaction/[invoice] ───────────────────────────────────────────
async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;

    const { data: tx, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice)
      .single();

    if (error || !tx) {
      return NextResponse.json(
        { success: false, message: error?.message ?? "Not found" },
        { status: 404 }
      );
    }

    const { data: txItems, error: txItemsErr } = await supabase
      .from("transaction_items")
      .select("*")
      .eq("invoice_number", invoice);
    if (txItemsErr) console.error("[GET /api/transaction/[invoice]] txItems error:", txItemsErr.message);
    const itemsPayload = txItems ?? [];

    // ── Accessory items: try transaction_items first, then fallback to accessory_outflows ──
    let accessory_items = itemsPayload
      .filter((it: any) => it.item_type === "accessory" || (Boolean(it.accessory_id) && !it.unit_id))
      .map((it: any) => ({
        accessory_id: it.accessory_id,
        name: it.item_name || it.laptop_name || "Aksesori",
        quantity: Number(it.quantity) || 1,
        deal_price: Number(it.deal_price ?? 0),
        selling_price: Number(it.selling_price ?? 0),
        is_bonus: Boolean(it.is_bonus || Number(it.deal_price) === 0),
      }));

    // Enrich names from accessories table if missing or generic
    const accIdsInTx = [...new Set(accessory_items.map((a: any) => a.accessory_id).filter(Boolean))];
    if (accIdsInTx.length > 0) {
      const { data: accLookup } = await supabase
        .from("accessories")
        .select("id, name, buy_price, category")
        .in("id", accIdsInTx);
      const accMap = new Map((accLookup ?? []).map((a: any) => [a.id, a]));
      accessory_items = accessory_items.map((a: any) => {
        const acc = accMap.get(a.accessory_id);
        return {
          ...a,
          name: acc?.name || a.name || "Aksesori",
          category: acc?.category || a.category,
          selling_price: a.selling_price || Number(acc?.buy_price ?? 0),
        };
      });
    }

    const unitIds: string[] = Array.isArray(tx.unit_ids)
      ? tx.unit_ids.filter(Boolean)
      : tx.unit_id
        ? [tx.unit_id]
        : [];

    if (unitIds.length > 0) {
      const { data: units } = await supabase
        .from("laptop_units")
        .select(
          "id, serial_number, purchase_price, laptop_id, laptop:laptops(laptop_name, cpu, ram, storage)"
        )
        .in("id", unitIds);

      if (units && units.length > 0) {
        const totalModalFromUnits = units.reduce(
          (sum: number, u: any) => sum + Number(u.purchase_price ?? 0),
          0
        );

        const enriched = (tx.grouped_items ?? []).map((g: any) => {
          const matchingUnits = units.filter((u: any) => {
            const snsInGroup: string[] = Array.isArray(g.serial_numbers)
              ? g.serial_numbers
              : [];
            return (
              snsInGroup.includes(u.serial_number) ||
              (u.laptop as any)?.laptop_name === g.laptop_name
            );
          });

          const purchase_price_total = matchingUnits.reduce(
            (sum: number, u: any) => sum + Number(u.purchase_price ?? 0),
            0
          );

          return {
            ...g,
            purchase_price_total,
            margin: Number(g.allocated_deal_price ?? 0) - purchase_price_total,
          };
        });

        if (enriched.length === 0 && units.length > 0) {
          return NextResponse.json({
            success: true,
            data: {
              ...tx,
              transaction_items: itemsPayload,
              accessory_items,
              purchase_price_total: totalModalFromUnits,
              inventory_price: totalModalFromUnits,
              other: Number(tx.deal_price ?? tx.amount ?? 0) - totalModalFromUnits,
            },
          });
        }

        const enrichedTotal = enriched.reduce(
          (s: number, g: any) => s + Number(g.purchase_price_total ?? 0),
          0
        );

        return NextResponse.json({
          success: true,
          data: {
            ...tx,
            transaction_items: itemsPayload,
            accessory_items,
            grouped_items: enriched,
            purchase_price_total: enrichedTotal,
            inventory_price: enrichedTotal,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...tx,
        transaction_items: itemsPayload,
        accessory_items,
        purchase_price_total: Number(tx.inventory_price ?? 0),
      },
    });
  } catch (error) {
    console.error("[GET /api/transaction/[invoice]]", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}

// ── PUT /api/transaction/[invoice] ───────────────────────────────────────────
async function putHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { invoice } = await props.params;
    const body = await req.json();

    const editReason = typeof body.edit_reason === "string" ? body.edit_reason.trim() : "";
    if (!editReason) {
      return NextResponse.json(
        { success: false, message: "Alasan edit wajib diisi" },
        { status: 400 }
      );
    }

    const { data: before } = await supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", invoice)
      .single();

    // ── Deteksi cancel & resolusi komposisi unit final ─────────────────
    // Dihitung di awal karena transaction_items harus sudah sinkron SEBELUM
    // deal_prices_per_unit diproses di bawah.
    const isCancelling =
      body.status === "CANCELLED" && before?.status !== "CANCELLED";

    const unitFieldsProvided =
      body.unit_ids !== undefined || body.unit_id !== undefined ||
      body.serial_numbers !== undefined || body.serial_number !== undefined;

    let finalNewUnitIds: string[] = [];
    let finalToRelease: string[] = [];
    let finalToMark: string[] = [];

    if (unitFieldsProvided && !isCancelling) {
      const oldIds: string[] = Array.isArray(before?.unit_ids)
        ? before.unit_ids.filter(Boolean)
        : before?.unit_id ? [before.unit_id] : [];
      const oldSNs: string[] = Array.isArray(before?.serial_numbers)
        ? before.serial_numbers.filter(Boolean)
        : before?.serial_number ? [before.serial_number] : [];
      const newIds: string[] = Array.isArray(body.unit_ids)
        ? body.unit_ids.filter(Boolean)
        : body.unit_id ? [body.unit_id] : [];
      const newSNs: string[] = Array.isArray(body.serial_numbers)
        ? body.serial_numbers.filter(Boolean)
        : body.serial_number ? [body.serial_number] : [];

      const finalOldUnitIds = await resolveUnitIds(oldIds, oldSNs);
      finalNewUnitIds = await resolveNewUnitIds(newIds, newSNs);

      if (newSNs.length > 0 && finalNewUnitIds.length < newSNs.length) {
        const { data: matchedRows } = await supabase
          .from("laptop_units")
          .select("serial_number")
          .in("serial_number", newSNs);
        const matchedSNs = new Set((matchedRows ?? []).map((r) => r.serial_number));
        const notFound = newSNs.filter((sn) => !matchedSNs.has(sn));
        if (notFound.length > 0) {
          return NextResponse.json(
            {
              success: false,
              message: `Serial number tidak ditemukan di database: ${notFound.join(", ")}. Periksa kembali penulisan SN — transaksi tidak disimpan.`,
            },
            { status: 400 }
          );
        }
      }

      const oldSet = new Set(finalOldUnitIds);
      const newSet = new Set(finalNewUnitIds);
      finalToRelease = finalOldUnitIds.filter((id) => !newSet.has(id));
      finalToMark = finalNewUnitIds.filter((id) => !oldSet.has(id));

      await reconcileTransactionItems(
        invoice,
        before?.id,
        finalNewUnitIds,
        Array.isArray(body.deal_prices_per_unit) ? body.deal_prices_per_unit : []
      );
    }

    const allowedFields: Record<string, any> = {};
    if (body.amount !== undefined) allowedFields.amount = Number(body.amount);
    if (body.deal_price !== undefined) allowedFields.deal_price = Number(body.deal_price);
    if (body.payment_method !== undefined) allowedFields.payment_method = body.payment_method;
    if (body.customer_name !== undefined) allowedFields.customer_name = body.customer_name;
    if (body.customer_phone !== undefined) allowedFields.customer_phone = body.customer_phone;
    if (body.company_name !== undefined) allowedFields.company_name = body.company_name;
    if (body.laptop_name !== undefined) allowedFields.laptop_name = body.laptop_name;
    if (body.laptop_id !== undefined) allowedFields.laptop_id = body.laptop_id;
    if (body.serial_number !== undefined) allowedFields.serial_number = body.serial_number;
    if (body.unit_id !== undefined) {
      const cleanUnitId = typeof body.unit_id === "string" ? body.unit_id.trim() : body.unit_id;
      allowedFields.unit_id = cleanUnitId ? cleanUnitId : null;
    }
    if (body.unit_ids !== undefined) {
      allowedFields.unit_ids = Array.isArray(body.unit_ids)
        ? body.unit_ids.filter((id: any) => typeof id === "string" && id.trim().length > 0)
        : body.unit_ids;
    }
    // FIX PENCEGAHAN: transactions.unit_ids TIDAK BOLEH cuma ikut apa yang
    // dikirim frontend — kalau edit cuma kirim serial_number (mis. fitur
    // "Tukar SN") tanpa ikut kirim unit_ids, kolom ini nyangkut jadi stale
    // padahal transaction_items.unit_id sudah benar. finalNewUnitIds di
    // sini SUDAH hasil resolve final (dari unit_ids ATAU serial_numbers,
    // lihat resolveNewUnitIds di atas), jadi selalu jadi sumber kebenaran
    // yang dipaksa nimpa apa pun yang dikirim body.
    // Dihapus syarat `.length > 0` — kalau edit bikin transaksi jadi nol unit
    // laptop (mis. semua SN dilepas, sisa aksesori doang), unit_ids HARUS
    // ikut dikosongkan juga, bukan dibiarkan nyisain array lama yang stale.
    if (unitFieldsProvided && !isCancelling) {
      allowedFields.unit_ids = finalNewUnitIds;
    }
    if (body.serial_numbers !== undefined) allowedFields.serial_numbers = body.serial_numbers;
    if (body.pickup_method !== undefined) allowedFields.pickup_method = body.pickup_method;
    if (body.pickup_date !== undefined) allowedFields.pickup_date = body.pickup_date;
    if (body.pickup_time !== undefined) allowedFields.pickup_time = body.pickup_time;
    if (body.pickup_location !== undefined) allowedFields.pickup_location = body.pickup_location;
    if (body.software_request !== undefined) allowedFields.software_request = body.software_request;
    if (body.source_platform !== undefined) allowedFields.source_platform = body.source_platform;
    if (body.status !== undefined) allowedFields.status = body.status;
    if (body.notes !== undefined) allowedFields.notes = body.notes;
    if (body.customer_type !== undefined) allowedFields.customer_type = body.customer_type;
    if (body.payment_method_2 !== undefined) allowedFields.payment_method_2 = body.payment_method_2;
    if (body.amount_method_1 !== undefined) allowedFields.amount_method_1 = Number(body.amount_method_1);
    if (body.amount_method_2 !== undefined) allowedFields.amount_method_2 = Number(body.amount_method_2);
    if (body.is_trade_in !== undefined) allowedFields.is_trade_in = Boolean(body.is_trade_in);
    if (body.trade_in_item !== undefined) allowedFields.trade_in_item = body.trade_in_item;
    if (body.trade_in_value !== undefined) allowedFields.trade_in_value = Number(body.trade_in_value);
    if (body.trade_in_cash !== undefined) allowedFields.trade_in_cash = Number(body.trade_in_cash);
    if (body.price_per_unit !== undefined) allowedFields.price_per_unit = Number(body.price_per_unit);

    // ── Handle update purchase_price per unit ────────────────────────
    type PurchasePriceUpdate = { unit_id: string; purchase_price: number };
    const purchasePricesPerUnit: PurchasePriceUpdate[] = Array.isArray(body.purchase_prices_per_unit)
      ? body.purchase_prices_per_unit
      : [];

    let newInventoryPrice: number | null = null;

    if (purchasePricesPerUnit.length > 0) {
      const validUpdates = purchasePricesPerUnit.filter(
        (p) =>
          typeof p.unit_id === "string" &&
          p.unit_id.trim().length > 0 &&
          Number.isFinite(Number(p.purchase_price)) &&
          Number(p.purchase_price) > 0  // ← ganti >= 0 jadi > 0
      );

      if (validUpdates.length > 0) {
        const updateResults = await Promise.allSettled(
          validUpdates.map((p) =>
            supabase
              .from("laptop_units")
              .update({ purchase_price: Math.round(Number(p.purchase_price)) })
              .eq("id", p.unit_id)
          )
        );

        updateResults.forEach((result, i) => {
          if (result.status === "rejected") {
            console.error(
              `[PUT transaction] Gagal update purchase_price unit ${validUpdates[i].unit_id}:`,
              result.reason
            );
          }
        });
      }

      // Recompute inventory_price dari SELURUH unit transaksi (bukan cuma yang
      // dikirim), supaya edit sebagian unit tidak menghapus modal unit lain.
      const txUnitIds: string[] = unitFieldsProvided
        ? finalNewUnitIds
        : (
          Array.isArray(before?.unit_ids)
            ? before.unit_ids
            : before?.unit_id
              ? [before.unit_id]
              : []
        ).filter(Boolean);

      if (txUnitIds.length > 0) {
        const { data: allUnits } = await supabase
          .from("laptop_units")
          .select("purchase_price")
          .in("id", txUnitIds);
        newInventoryPrice = (allUnits ?? []).reduce(
          (sum, u) => sum + (Number(u.purchase_price) || 0),
          0
        );
      } else {
        newInventoryPrice = validUpdates.reduce(
          (sum, p) => sum + Math.round(Number(p.purchase_price) || 0),
          0
        );
      }
    }

    // ── Handle update deal_price per unit di transaction_items ────────
    type DealPriceUpdate = { unit_id?: string; serial_number?: string; deal_price: number };
    const dealPricesPerUnit: DealPriceUpdate[] = Array.isArray(body.deal_prices_per_unit)
      ? body.deal_prices_per_unit
      : [];

    let newDealTotal: number | null = null;

    if (dealPricesPerUnit.length > 0) {
      const validDeal = dealPricesPerUnit.filter(
        (p) => Number.isFinite(Number(p.deal_price)) && Number(p.deal_price) > 0  // ← ganti >= 0 jadi > 0
      );

      await Promise.allSettled(
        validDeal.map((p) => {
          const base = supabase
            .from("transaction_items")
            .update({ deal_price: Math.round(Number(p.deal_price)) })
            .eq("invoice_number", invoice);
          return p.unit_id && String(p.unit_id).trim().length > 0
            ? base.eq("unit_id", p.unit_id)
            : base.eq("serial_number", p.serial_number ?? "");
        })
      );

      // Recompute total deal dari SELURUH transaction_items (laptop + aksesori),
      // bukan cuma unit yang dikirim, supaya edit sebagian tidak menjatuhkan total.
      const { data: allItems } = await supabase
        .from("transaction_items")
        .select("deal_price")
        .eq("invoice_number", invoice);
      if (allItems && allItems.length > 0) {
        newDealTotal = allItems.reduce(
          (s, it) => s + (Number(it.deal_price) || 0),
          0
        );
      } else {
        newDealTotal = validDeal.reduce(
          (s, p) => s + Math.round(Number(p.deal_price) || 0),
          0
        );
      }
    }

    // ── Handle update accessories ────────────────────────────────────
    if (Array.isArray(body.accessories) && !isCancelling) {
      // 1. Hapus row aksesori lama dari transaction_items
      await supabase
        .from("transaction_items")
        .delete()
        .eq("invoice_number", invoice)
        .eq("item_type", "accessory");

      // 2. Fallback laptop_id untuk constraint DB
      const fallbackLaptopId =
        finalNewUnitIds[0] ||
        before?.laptop_id ||
        (Array.isArray(before?.unit_ids) ? before.unit_ids[0] : null) ||
        "5029ed37-6f81-4b13-a447-19e3df29c298";

      const newAccItems = body.accessories.map((a: any) => ({
        transaction_id: before?.id,
        invoice_number: invoice,
        item_type: "accessory",
        unit_id: null,
        accessory_id: a.accessory_id && String(a.accessory_id).trim() ? a.accessory_id : null,
        laptop_id: fallbackLaptopId,
        serial_number: "-",
        laptop_name: a.name || "Aksesori",
        item_name: a.name || "Aksesori",
        quantity: Number(a.quantity) || 1,
        is_bonus: Boolean(a.is_bonus),
        selling_price: Number(a.selling_price ?? 0),
        deal_price: a.is_bonus ? 0 : Number(a.deal_price ?? 0),
      }));

      if (newAccItems.length > 0) {
        const { error: accInsertErr } = await supabase
          .from("transaction_items")
          .insert(newAccItems);
        if (accInsertErr) console.error("[PUT /api/transaction] insert accessory_items error:", accInsertErr.message);
      }

      // 3. Reconcile accessory_outflows & stok aksesori
      await cancelOutflowByInvoice(invoice);
      for (const a of body.accessories) {
        if (a.accessory_id && Number(a.quantity) > 0) {
          await recordOutflow({
            accessory_id: a.accessory_id,
            source_type: "transaction",
            transaction_invoice: invoice,
            qty: Number(a.quantity),
            notes: `Penjualan (Edit) ${invoice}`,
            taken_by_role: "SALES",
          });
          const { data: acc } = await supabase
            .from("accessories")
            .select("stock")
            .eq("id", a.accessory_id)
            .maybeSingle();
          if (acc) {
            await supabase
              .from("accessories")
              .update({ stock: Math.max(0, (Number(acc.stock) || 0) - Number(a.quantity)) })
              .eq("id", a.accessory_id);
          }
        }
      }

      const currentUnitIds = unitFieldsProvided
        ? finalNewUnitIds
        : (Array.isArray(before?.unit_ids) ? before.unit_ids : before?.unit_id ? [before.unit_id] : []).filter(Boolean);
      const hasLaptops = currentUnitIds.length > 0;
      const hasAccs = body.accessories.length > 0;
      allowedFields.item_kind = hasLaptops && hasAccs ? "mixed" : hasLaptops ? "laptop" : "accessory";

      // Hitung ulang total deal dari SELURUH transaction_items (laptop + aksesori)
      // SETELAH baris aksesori di atas selesai di-update. Tanpa ini, edit nominal
      // aksesori saja (tanpa ikut kirim deal_prices_per_unit) tidak pernah mengubah
      // transactions.deal_price/amount — jadi halaman Riwayat Transaksi (yang baca
      // langsung dari kolom itu) tetap nunjukin harga lama.
      const { data: allItemsAfterAcc } = await supabase
        .from("transaction_items")
        .select("deal_price")
        .eq("invoice_number", invoice);
      if (allItemsAfterAcc && allItemsAfterAcc.length > 0) {
        newDealTotal = allItemsAfterAcc.reduce(
          (s, it) => s + (Number(it.deal_price) || 0),
          0
        );
      }
    }

    // ── Hitung field other (profit) ──────────────────────────────────
    const dealPrice =
      newDealTotal !== null
        ? newDealTotal
        : (body.deal_price ?? body.amount ?? before?.deal_price ?? before?.amount ?? 0);
    const inventoryPrice =
      newInventoryPrice !== null
        ? newInventoryPrice
        : before?.inventory_price ?? 0;

    allowedFields.other = Number(dealPrice) - Number(inventoryPrice);

    if (newDealTotal !== null) {
      allowedFields.deal_price = newDealTotal;
      allowedFields.amount = newDealTotal;
    }

    if (newInventoryPrice !== null) {
      allowedFields.inventory_price = newInventoryPrice;
    }

    allowedFields.edit_reason = editReason;

    allowedFields.last_edited_by = user.name;
    allowedFields.last_edited_at = new Date().toISOString();

    // ── Update tabel transactions ────────────────────────────────────
    const { data, error } = await supabase
      .from("transactions")
      .update(allowedFields)
      .eq("invoice_number", invoice)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }


    if (isCancelling) {
      await releaseTransactionUnits(before, invoice);
    } else {
      const currentUnitIds = unitFieldsProvided
        ? finalNewUnitIds
        : (Array.isArray(before?.unit_ids) ? before.unit_ids : before?.unit_id ? [before.unit_id] : []).filter(Boolean);

      const effectiveStatus = body.status !== undefined ? body.status : before?.status;
      const mappedUnitStatus = STATUS_TO_UNIT_STATUS[effectiveStatus];

      if (mappedUnitStatus) {
        await applyFinalUnitStatuses(finalToRelease, currentUnitIds, mappedUnitStatus);
      } else if (finalToRelease.length > 0 || finalToMark.length > 0) {
        await syncUnitStatusesByFinalIds(finalToRelease, finalToMark);
      }
    }

    // ── Activity log ─────────────────────────────────────────────────
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "transaction",
      entityId: before?.id,
      entityLabel: `${invoice} — ${before?.customer_name ?? "—"}`,
      reason: editReason,
      beforeData: before,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[PUT /api/transaction/[invoice]]", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}

export const GET = withAuth(
  getHandler,
  PERMISSIONS.EDIT_TRANSACTION.concat(["ACCOUNTING"])
);
export const PUT = withAuth(putHandler, PERMISSIONS.EDIT_TRANSACTION);