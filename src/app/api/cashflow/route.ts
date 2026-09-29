// src/app/api/cashflow/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
    CASHFLOW_START_DATE,
    isValidCategory,
    isModalAwalActive,
    isManualIncomeCategory,
    formatTxPaymentMethod,
} from "@/lib/cashflow";
import { fetchAllRows } from "@/lib/supabaseFetch";

// ⬅️ BARU: .in() dengan ratusan/ribuan nilai bikin URL ke PostgREST kepanjangan
// (414 URI Too Long) & hasilnya juga kepotong max-rows 1000. Dipecah per batch,
// dijalankan paralel, dan error-nya dicatat (dulu error diam-diam → txMap kosong
// → semua transaksi BATAL tidak pernah terdeteksi is_voided).
const IN_CHUNK_SIZE = 150;

async function selectInChunks<T>(
    values: string[],
    run: (chunk: string[]) => PromiseLike<{ data: any; error: { message: string } | null }>
): Promise<{ rows: T[]; ok: boolean }> {
    const unique = Array.from(new Set(values.filter(Boolean)));
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += IN_CHUNK_SIZE) {
        chunks.push(unique.slice(i, i + IN_CHUNK_SIZE));
    }

    const results = await Promise.all(chunks.map((c) => run(c)));
    const rows: T[] = [];
    let ok = true;
    for (const r of results) {
        if (r.error) {
            ok = false;
            console.error("[cashflow] selectInChunks error:", r.error.message);
            continue;
        }
        rows.push(...((r.data ?? []) as T[]));
    }
    return { rows, ok };
}

// ⬅️ FIX: pengganti .upsert(..., { onConflict: "source_type,source_id", ignoreDuplicates: true }).
// Unique index di cashflow_entries sekarang PARSIAL (WHERE source_type <> 'PENGAJUAN_DANA' /
// WHERE source_id IS NOT NULL). Postgres TIDAK BISA memakai index parsial untuk
// ON CONFLICT (source_type, source_id) tanpa klausa WHERE — dan PostgREST tidak bisa
// mengirim klausa itu. Hasilnya SETIAP upsert error 42P10 ("there is no unique or
// exclusion constraint matching the ON CONFLICT specification") → entry TRANSACTION /
// TRANSACTION_DP / TRANSACTION_PAYMENT tidak pernah masuk sejak index diganti.
// Solusi: insert biasa (baris yang sudah ada sudah difilter lewat lookup sebelumnya).
// Kalau batch ditolak karena ada 1+ baris dobel (23505, mis. dua request sync balapan),
// ulangi per baris & lewati yang dobel — index unik tetap jadi pengaman anti-dobel.
async function insertIgnoreDuplicates(
    supabase: SupabaseClient,
    rows: Record<string, any>[],
    label: string
): Promise<void> {
    if (rows.length === 0) return;

    const { error } = await supabase.from("cashflow_entries").insert(rows);
    if (!error) {
        console.log(`[cashflow sync] inserted ${rows.length} ${label} entries`);
        return;
    }
    if (error.code !== "23505") {
        console.error(`[cashflow sync] insert ${label} error:`, error.code, error.message);
        return;
    }

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
        const { error: rowErr } = await supabase.from("cashflow_entries").insert(row);
        if (!rowErr) inserted++;
        else if (rowErr.code === "23505") skipped++;
        else console.error(`[cashflow sync] insert ${label} (per baris) error:`, rowErr.code, rowErr.message);
    }
    console.log(`[cashflow sync] inserted ${inserted} ${label} entries (${skipped} dobel dilewati)`);
}

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

const jakartaDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// Order service yang DIBUAT mulai tanggal ini memakai sistem DP baru (DP masuk Cashflow
// begitu diterima). Order sebelum tanggal ini TIDAK berubah, tetap sistem lama
// (masuk hanya kalau SUDAH_DIAMBIL). Ubah tanggal ini sesuai hari kamu deploy.
const SERVICE_DP_START_DATE = "2026-09-29";


function getJoinedName(joined: any): string | null {
    if (!joined) return null;
    if (Array.isArray(joined)) {
        return (joined[0] as { id: string; name: string } | undefined)?.name ?? null;
    }
    return (joined as { id: string; name: string }).name ?? null;
}

// Keterangan gabung nama customer + laptop yang dibeli. Kalau transaksi multi-laptop
// (laptop_name di tabel transactions kosong karena datanya tersebar di transaction_items),
// fallback ke "Multi Laptop" — supaya tetap informatif tanpa perlu join tambahan.
function formatCustomerLaptopKeterangan(customerName?: string | null, laptopName?: string | null): string {
    const customer = (customerName as string) || "—";
    const laptop = (laptopName as string)?.trim() || "Multi Laptop";
    return `${customer} · ${laptop}`;
}

function buildTxPayload(t: any) {
    const refDate = (t.paid_at || t.created_at) as string;
    return {
        direction: "IN",
        category: "PENJUALAN_LAPTOP",
        nama: (t.sales_name as string) || "Sales",
        nominal: Math.round(Number(t.deal_price ?? t.amount ?? 0)),
        modal: null,
        keterangan: formatCustomerLaptopKeterangan(t.customer_name, t.laptop_name),
        tanggal: jakartaDate(refDate),
        source_type: "TRANSACTION",
        source_id: t.invoice_number as string,
        payment_method: null,
    };
}

function buildSvcPayload(
    s: any,
    techName: string,
    opts: { nominal: number; sourceId: string; label: string; refDate: string }
) {
    return {
        direction: "IN",
        category: "SERVICE",
        nama: techName,
        nominal: Math.round(opts.nominal),
        modal: null,
        keterangan: `Service · ${(s.nama as string) || "—"} · ${(s.payment_method as string) || "—"}${opts.label}`,
        tanggal: jakartaDate(opts.refDate),
        source_type: "SERVICE",
        source_id: opts.sourceId,
        payment_method: null,
    };
}

const RECONCILE_FIELDS = ["nominal", "nama", "keterangan", "tanggal", "category"] as const;

function diffPayload(existing: any, desired: Record<string, any>): Record<string, any> {
    const patch: Record<string, any> = {};
    for (const f of RECONCILE_FIELDS) {
        if (!(f in desired)) continue;
        const a = f === "nominal" ? Number(existing[f] ?? 0) : existing[f];
        const b = f === "nominal" ? Number(desired[f] ?? 0) : desired[f];
        if (a !== b) patch[f] = desired[f];
    }
    return patch;
}

async function syncTransactionEntries(supabase: SupabaseClient) {
    // ⬅️ FIX: pagination + order — dulu kena limit 1000 baris PostgREST,
    // transaksi yang paling baru PAID kepotong & tidak pernah masuk Cashflow.
    let transactions: any[];
    try {
        transactions = await fetchAllRows<any>((from, to) =>
            supabase
                .from("transactions")
                .select("id, invoice_number, customer_name, sales_name, laptop_name, deal_price, amount, created_at, paid_at, status")
                .eq("status", "PAID")
                .gte("created_at", `${CASHFLOW_START_DATE}T00:00:00+07:00`)
                .order("id", { ascending: true })
                .range(from, to)
        );
    } catch (e: any) {
        console.error("[cashflow sync] fetch transactions error:", e?.message ?? e);
        return;
    }
    if (transactions.length === 0) return;

    const { rows: paidInvoicesWithPayments, ok: okPayments } = await selectInChunks<any>(
        transactions.map((t: any) => t.invoice_number as string),
        (chunk) => supabase.from("transaction_payments").select("invoice_number").in("invoice_number", chunk)
    );
    if (!okPayments) return; // ⬅️ fail-closed: kalau cek gagal, jangan sync (bisa dobel-hitung)
    const invoicesWithPayments = new Set(paidInvoicesWithPayments.map((p: any) => p.invoice_number as string));

    // ✅ FIX: dulu transaksi BARU (dibuat >= cutoff) SELALU di-sync PENUH saat PAID
    // walau sudah ada baris transaction_payments (DP/cicilan). Sekarang DP/cicilan
    // SELALU disinkronkan begitu terjadi (lihat syncLegacyDpEntries &
    // syncTransactionPaymentEntries), jadi aturan skip-nya disamakan utk semua
    // transaksi: kalau invoice sudah tercatat sebagian lewat transaction_payments,
    // jangan dobel-hitung lagi di sini saat status jadi PAID.
    const transactionsToSync = (transactions as any[]).filter(
        (t) => !invoicesWithPayments.has(t.invoice_number as string)
    );
    if (transactionsToSync.length === 0) return;

    const invoices = transactionsToSync.map((t: any) => t.invoice_number as string);

    // ✅ FIX: sebelumnya nominal TRANSACTION_DP yang sudah tercatat (lihat syncLegacyDpEntries)
    // tidak pernah dicek di sini, jadi begitu transaksi jadi PAID, insert-nya pakai deal_price
    // FULL — padahal DP-nya sudah masuk & diaudit duluan sebagai entry terpisah. Efeknya
    // dobel-hitung ("transaksi sudah diaudit kok muncul lagi"). Map ini dipakai buat
    // mengurangi nominal yang akan di-insert dengan DP yang sudah tercatat.
    const { rows: legacyDpEntries, ok: okDp } = await selectInChunks<any>(invoices, (chunk) =>
        supabase.from("cashflow_entries").select("source_id, nominal").eq("source_type", "TRANSACTION_DP").in("source_id", chunk)
    );
    const { rows: existing, ok: okExisting } = await selectInChunks<any>(invoices, (chunk) =>
        supabase
            .from("cashflow_entries")
            .select("id, source_id, nominal, nama, keterangan, tanggal, category, is_audited")
            .eq("source_type", "TRANSACTION")
            .in("source_id", chunk)
    );
    // ⬅️ fail-closed: kalau DP gagal dibaca, nominal bisa ter-insert FULL (dobel sama DP)
    if (!okDp || !okExisting) return;

    const dpNominalMap = new Map<string, number>(
        legacyDpEntries.map((e: any) => [e.source_id as string, Number(e.nominal ?? 0)])
    );
    const existingMap = new Map<string, any>(
        existing.map((e: any) => [e.source_id as string, e])
    );

    const toInsert: any[] = [];
    const updates: { id: string; patch: Record<string, any> }[] = [];

    for (const t of transactionsToSync) {
        const desired = buildTxPayload(t);

        // ✅ FIX: kurangi dengan DP yang sudah tercatat (TRANSACTION_DP) supaya yang
        // masuk cuma SISA pelunasan, bukan deal_price utuh. Kalau DP == deal_price
        // (lunas lewat DP doang), nominal jadi 0 → otomatis di-skip, tidak ada entry baru.
        const dpAlready = dpNominalMap.get(t.invoice_number as string) ?? 0;
        if (dpAlready > 0) {
            desired.nominal = Math.max(0, desired.nominal - dpAlready);
        }

        if (desired.nominal <= 0 || desired.tanggal < CASHFLOW_START_DATE) continue;

        const cur = existingMap.get(t.invoice_number as string);

        if (!cur) {
            toInsert.push({ ...desired, is_audited: false });
            continue;
        }
        // ⬅️ FIX: dulu `if (cur.is_audited) continue;` — entry TRANSACTION yang sudah
        // diaudit dikunci & tidak pernah ikut turun saat deal_price transaksi diedit,
        // jadi nominal Cashflow nyangkut di harga lama (mis. 10jt) padahal transaksinya
        // sudah 9.85jt. Sekarang disamakan dengan SERVICE: entry tetap direkonsiliasi
        // ke deal_price TERKINI walau sudah diaudit. Status audit (is_audited/audited_at/
        // audited_by) TIDAK ikut diubah — cuma nominal & field turunan yang disamakan.
        const patch = diffPayload(cur, desired);
        if (Object.keys(patch).length > 0) updates.push({ id: cur.id, patch });
    }

    // ⬅️ FIX: dulu .upsert(onConflict) → selalu error 42P10 (lihat insertIgnoreDuplicates)
    await insertIgnoreDuplicates(supabase, toInsert, "transaction");

    if (updates.length > 0) {
        const results = await Promise.allSettled(
            updates.map((u) =>
                supabase.from("cashflow_entries").update(u.patch).eq("id", u.id)
            )
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        console.log(`[cashflow sync] reconciled ${updates.length - failed} transaction entries`);
        if (failed > 0) console.error(`[cashflow sync] ${failed} reconcile transaksi GAGAL`);
    }
}
// Service → Cashflow. Mengikuti aturan buildServiceDrafts() di lib/accountingSource.ts:
// - order dibuat SEBELUM SERVICE_DP_START_DATE → data lama, perilaku lama (hanya SUDAH_DIAMBIL, DP diabaikan)
// - payment_status "DP"  → masuk begitu diterima, status servis apa pun (order baru saja)
// - lunas langsung       → hanya kalau SUDAH_DIAMBIL (perilaku lama, direkonsiliasi)
// - DP bertahap dicatat per SELISIH: id__DP1, id__DP2, id__PELUNASAN
async function syncServiceEntries(
    supabase: SupabaseClient,
    services: any[],
    technicianNameMap: Map<string, string>
) {
    if (services.length === 0) return;

    const serviceIds = services.map((s: any) => String(s.id));

    // Ambil semua entry cashflow service: id polos + id__DP1 / id__PELUNASAN
    const existingByService = new Map<string, any[]>();
    for (let i = 0; i < serviceIds.length; i += 75) {
        const batch = serviceIds.slice(i, i + 75);
        const orFilter = batch.map((sid) => `source_id.eq.${sid},source_id.like.${sid}__*`).join(",");
        const { data, error } = await supabase
            .from("cashflow_entries")
            .select("id, source_id, nominal, nama, keterangan, tanggal, category")
            .eq("source_type", "SERVICE")
            .or(orFilter);
        if (error) {
            console.error("[cashflow sync] lookup service entries error:", error.message);
            return; // fail-closed: jangan insert kalau cek dobel gagal
        }
        for (const e of (data ?? []) as any[]) {
            const baseId = String(e.source_id).split("__")[0];
            const list = existingByService.get(baseId) ?? [];
            list.push(e);
            existingByService.set(baseId, list);
        }
    }

    const toInsert: any[] = [];
    const updates: { id: string; patch: Record<string, any> }[] = [];

    for (const s of services) {
        const idStr = String(s.id);

        let techName = "Teknisi";
        if (s.dikerjakan_by && technicianNameMap.has(s.dikerjakan_by as string)) {
            techName = technicianNameMap.get(s.dikerjakan_by as string)!;
        } else {
            const joinedName = getJoinedName(s.dikerjakan_by_user);
            if (joinedName) techName = joinedName;
        }

        const bayar = Math.round(Number(s.payment_amount ?? 0));
        const isDp = s.payment_status === "DP";
        const entries = existingByService.get(idStr) ?? [];
        const hasSplit = entries.some((e) => e.source_id !== idStr);

        // Order dibuat sebelum SERVICE_DP_START_DATE = data lama, JANGAN pakai sistem DP baru
        const isNewSystem =
            !!s.tanggal_masuk && jakartaDate(s.tanggal_masuk as string) >= SERVICE_DP_START_DATE;

        // ── JALUR A: data lama, ATAU lunas langsung & belum pernah dipecah → PERILAKU LAMA ──
        if (!isNewSystem || (!isDp && !hasSplit)) {
            if (isDp) continue; // data lama yang masih DP: abaikan, tunggu lunas & diambil
            if (s.status !== "SUDAH_DIAMBIL") continue;

            const desired = buildSvcPayload(s, techName, {
                nominal: bayar,
                sourceId: idStr,
                label: "",
                refDate: (s.tanggal_diambil || s.tanggal_selesai || s.tanggal_masuk) as string,
            });
            if (desired.tanggal < CASHFLOW_START_DATE) continue;

            // ⬅️ FIX (perilaku lama): nominal 0 tetap direkonsiliasi kalau entry sudah ada
            // (payment_amount diedit jadi 0), tapi entry BARU tidak dibuat untuk servis gratis.
            const cur = entries.find((e) => e.source_id === idStr);
            if (!cur) {
                if (desired.nominal <= 0) continue;
                toInsert.push({ ...desired, is_audited: false });
                continue;
            }
            // is_audited/audited_at/audited_by TIDAK ikut berubah — cuma nominal & field turunan.
            const patch = diffPayload(cur, desired);
            if (Object.keys(patch).length > 0) updates.push({ id: cur.id, patch });
            continue;
        }

        // ── JALUR B: order baru dengan DP → catat hanya SELISIH yang belum dibukukan ──
        const posted = entries.reduce((sum, e) => sum + Math.round(Number(e.nominal ?? 0)), 0);
        const delta = bayar - posted;
        if (delta <= 0) continue;

        let sourceId: string;
        let label: string;
        if (isDp) {
            const sisa = Math.max(Number(s.total_tagihan ?? 0) - bayar, 0);
            sourceId = `${idStr}__DP${entries.length + 1}`;
            label = ` · DP (sisa Rp${Math.round(sisa).toLocaleString("id-ID")})`;
        } else {
            const hasPelunasan = entries.some((e) => e.source_id === `${idStr}__PELUNASAN`);
            sourceId = hasPelunasan ? `${idStr}__PELUNASAN${entries.length + 1}` : `${idStr}__PELUNASAN`;
            label = " · Pelunasan";
        }

        const desired = buildSvcPayload(s, techName, {
            nominal: delta,
            sourceId,
            label,
            // payment_confirmed_at = kapan uang benar-benar diterima (sama seperti Jurnal)
            refDate: (s.payment_confirmed_at || s.tanggal_diambil || s.tanggal_selesai || s.tanggal_masuk) as string,
        });
        if (desired.tanggal < CASHFLOW_START_DATE) continue;
        toInsert.push({ ...desired, is_audited: false });
    }

    // ⬅️ FIX: insert biasa + fallback per baris kalau ada yang dobel (lihat insertIgnoreDuplicates).
    // JANGAN pakai .upsert(onConflict) di sini — index unik-nya parsial, pasti error 42P10.
    await insertIgnoreDuplicates(supabase, toInsert, "service");

    if (updates.length > 0) {
        const results = await Promise.allSettled(
            updates.map((u) =>
                supabase.from("cashflow_entries").update(u.patch).eq("id", u.id)
            )
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        console.log(`[cashflow sync] reconciled ${updates.length - failed} service entries`);
        if (failed > 0) console.error(`[cashflow sync] ${failed} reconcile service GAGAL`);
    }
}
function buildPaymentPayload(p: any, customerName: string, salesName: string, laptopName: string) {
    return {
        direction: "IN",
        category: "PENJUALAN_LAPTOP",
        nama: salesName || "Sales",
        nominal: Math.round(Number(p.amount ?? 0)),
        modal: null,
        keterangan: formatCustomerLaptopKeterangan(customerName, laptopName),
        tanggal: jakartaDate(p.created_at),
        source_type: "TRANSACTION_PAYMENT",
        source_id: p.id as string,
        payment_method: null,
    };
}

function buildDpPayload(t: any) {
    const refDate = t.created_at as string;
    return {
        direction: "IN",
        category: "PENJUALAN_LAPTOP",
        nama: (t.sales_name as string) || "Sales",
        nominal: Math.round(Number(t.dp_amount ?? 0)),
        modal: null,
        keterangan: formatCustomerLaptopKeterangan(t.customer_name, t.laptop_name),
        tanggal: jakartaDate(refDate),
        source_type: "TRANSACTION_DP",
        source_id: t.invoice_number as string,
        payment_method: null,
    };
}

// ── Backfill LANGSUNG dari tabel transactions (bukan dari transaction_payments) —
// menangkap semua transaksi lama berstatus DP/Ambil-Dulu/Packing yang dp_amount-nya
// belum pernah tercatat di manapun. Sama seperti syncTransactionEntries yang baca
// langsung dari transactions PAID → cashflow_entries, tanpa tabel perantara.
// HANYA insert sekali per invoice, tidak pernah direkonsiliasi ulang — supaya kalau
// nanti transaksi itu dapat cicilan baru (menambah dp_amount di transactions),
// tidak dobel-hitung dengan cicilan baru yang tercatat terpisah lewat transaction_payments.
async function syncLegacyDpEntries(supabase: SupabaseClient) {
    // ✅ FIX: dulu ada .lt("created_at", CASHFLOW_HOLD_UNTIL_PAID_CUTOFF_ISO) di sini,
    // jadi transaksi DP yang dibuat >= 10 Agu 2026 tidak pernah ikut ke-backfill.
    // Filter cutoff dihapus — berlaku utk SEMUA transaksi DP/Ambil-Dulu/Packing.
    // ⬅️ FIX: pagination + order — dulu kena limit 1000 baris PostgREST.
    let pendingTx: any[];
    try {
        pendingTx = await fetchAllRows<any>((from, to) =>
            supabase
                .from("transactions")
                .select("id, invoice_number, customer_name, sales_name, laptop_name, dp_amount, status, created_at")
                .in("status", ["RESERVED", "HELD", "PACKING"])
                .gte("created_at", `${CASHFLOW_START_DATE}T00:00:00+07:00`)
                .order("id", { ascending: true })
                .range(from, to)
        );
    } catch (e: any) {
        console.error("[cashflow sync] fetch legacy DP transactions error:", e?.message ?? e);
        return;
    }
    if (pendingTx.length === 0) return;

    const withDp = pendingTx.filter((t: any) => Number(t.dp_amount) > 0);
    if (withDp.length === 0) return;

    const invoices = withDp.map((t: any) => t.invoice_number as string);

    // ⬅️ FIX: .in() dipecah per batch — dulu URL kepanjangan & error-nya tidak dicek.
    const { rows: paymentRows, ok: okPay } = await selectInChunks<any>(invoices, (chunk) =>
        supabase.from("transaction_payments").select("invoice_number").in("invoice_number", chunk)
    );
    const { rows: existingDpEntries, ok: okDp } = await selectInChunks<any>(invoices, (chunk) =>
        supabase.from("cashflow_entries").select("source_id").eq("source_type", "TRANSACTION_DP").in("source_id", chunk)
    );
    if (!okPay || !okDp) return; // ⬅️ fail-closed: jangan insert DP kalau cek dobel gagal
    const hasPaymentRow = new Set(paymentRows.map((p: any) => p.invoice_number as string));
    const hasDpEntry = new Set(existingDpEntries.map((e: any) => e.source_id as string));

    const toInsert = withDp
        .filter((t: any) => !hasPaymentRow.has(t.invoice_number as string) && !hasDpEntry.has(t.invoice_number as string))
        .map((t: any) => ({ ...buildDpPayload(t), is_audited: false }))
        .filter((e) => e.nominal > 0 && e.tanggal >= CASHFLOW_START_DATE);

    // ⬅️ FIX: dulu .upsert(onConflict) → selalu error 42P10 (lihat insertIgnoreDuplicates)
    await insertIgnoreDuplicates(supabase, toInsert, "legacy DP");
}

async function syncTransactionPaymentEntries(supabase: SupabaseClient) {
    // ⬅️ FIX: pagination + order — dulu kena limit 1000 baris PostgREST.
    let payments: any[];
    try {
        payments = await fetchAllRows<any>((from, to) =>
            supabase
                .from("transaction_payments")
                .select("id, invoice_number, amount, payment_type, created_at")
                .gte("created_at", `${CASHFLOW_START_DATE}T00:00:00+07:00`)
                .order("created_at", { ascending: true })
                .order("id", { ascending: true })
                .range(from, to)
        );
    } catch (e: any) {
        console.error("[cashflow sync] fetch transaction_payments error:", e?.message ?? e);
        return;
    }
    if (payments.length === 0) return;

    const seenDpInvoices = new Set<string>();
    const dedupedPayments = [...payments]
        .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
        .filter((p: any) => {
            if (p.payment_type !== "DP") return true;
            if (seenDpInvoices.has(p.invoice_number as string)) return false;
            seenDpInvoices.add(p.invoice_number as string);
            return true;
        });

    // ⬅️ FIX: cek invoice yang SUDAH pernah disinkron penuh lewat source_type
    // TRANSACTION. Tanpa cek ini, baris transaction_payments yang masih ada
    // (dari backfill lama) bakal terus-menerus bikin entry duplikat baru
    // setiap kali GET /api/cashflow jalan — persis kasus yang barusan kejadian.
    const invoiceNumbersToCheck = [...new Set(dedupedPayments.map((p: any) => p.invoice_number as string))];
    const invoicesAlreadySynced = new Set<string>();
    const dpPostedByInvoice = new Map<string, number>(); // ⬅️ nominal TRANSACTION_DP per invoice
    if (invoiceNumbersToCheck.length > 0) {
        const { rows: existingTxEntries, ok } = await selectInChunks<any>(invoiceNumbersToCheck, (chunk) =>
            supabase.from("cashflow_entries").select("source_id").eq("source_type", "TRANSACTION").in("source_id", chunk)
        );
        if (!ok) return; // ⬅️ fail-closed: kalau gagal cek, bisa dobel-hitung
        for (const e of existingTxEntries) {
            invoicesAlreadySynced.add(e.source_id as string);
        }

        // ⬅️ BARU: invoice yang DP-nya sudah tercatat sebagai TRANSACTION_DP
        const { rows: existingDpEntries, ok: okDp } = await selectInChunks<any>(invoiceNumbersToCheck, (chunk) =>
            supabase.from("cashflow_entries").select("source_id, nominal").eq("source_type", "TRANSACTION_DP").in("source_id", chunk)
        );
        if (!okDp) return; // fail-closed
        for (const e of existingDpEntries) {
            dpPostedByInvoice.set(e.source_id as string, Number(e.nominal ?? 0));
        }
    }

    const paymentIds = dedupedPayments.map((p: any) => p.id as string);
    const { rows: existing, ok: okExisting } = await selectInChunks<any>(paymentIds, (chunk) =>
        supabase.from("cashflow_entries").select("id, source_id, nominal").eq("source_type", "TRANSACTION_PAYMENT").in("source_id", chunk)
    );
    if (!okExisting) return;

    const existingIds = new Set(existing.map((e: any) => e.source_id as string));

    // ⬅️ BARU: total nominal yang SUDAH tercatat per invoice (TRANSACTION_DP + TRANSACTION_PAYMENT lama)
    const invoiceByPaymentId = new Map<string, string>(
        dedupedPayments.map((p: any) => [p.id as string, p.invoice_number as string])
    );
    const postedByInvoice = new Map<string, number>(dpPostedByInvoice);
    for (const e of existing) {
        const inv = invoiceByPaymentId.get(e.source_id as string);
        if (!inv) continue;
        postedByInvoice.set(inv, (postedByInvoice.get(inv) ?? 0) + Number(e.nominal ?? 0));
    }

    const missing = dedupedPayments.filter(
        (p: any) =>
            !existingIds.has(p.id as string) &&
            !invoicesAlreadySynced.has(p.invoice_number as string) &&
            !(p.payment_type === "DP" && dpPostedByInvoice.has(p.invoice_number as string))
    );
    if (missing.length === 0) return;

    const invoiceNumbers = [...new Set(missing.map((p: any) => p.invoice_number as string))];
    // ⬅️ UBAH: ambil deal_price/amount untuk batas total, dan fail-closed
    // (tanpa harga, batas tidak bisa dicek → jangan insert daripada berisiko dobel)
    const { rows: txRows, ok: okTx } = await selectInChunks<any>(invoiceNumbers, (chunk) =>
        supabase
            .from("transactions")
            .select("invoice_number, customer_name, sales_name, laptop_name, created_at, deal_price, amount")
            .in("invoice_number", chunk)
    );
    if (!okTx) return;
    const txInfoMap = new Map<string, any>(txRows.map((t: any) => [t.invoice_number as string, t]));

    const toInsert: any[] = [];
    for (const p of missing) {
        const inv = p.invoice_number as string;
        const info = txInfoMap.get(inv);
        const payload = buildPaymentPayload(p, info?.customer_name ?? "—", info?.sales_name ?? "Sales", info?.laptop_name ?? "");
        if (payload.nominal <= 0 || payload.tanggal < CASHFLOW_START_DATE) continue;

        // ⬅️ BARU: total Cashflow satu invoice tidak boleh melebihi harga transaksi
        const price = info ? Math.round(Number(info.deal_price ?? info.amount ?? 0)) : 0;
        const posted = postedByInvoice.get(inv) ?? 0;
        if (price > 0 && posted + payload.nominal > price) {
            console.warn(`[cashflow sync] payment ${p.id} (${inv}) dilewati: ${posted}+${payload.nominal} > harga ${price}`);
            continue;
        }
        postedByInvoice.set(inv, posted + payload.nominal);
        toInsert.push({ ...payload, is_audited: false });
    }

    await insertIgnoreDuplicates(supabase, toInsert, "payment");
} // ⬅️ FIX: kurung penutup fungsi yang tadinya hilang


// ⬅️ BARU: entri TRANSACTION_PAYMENT dibuat SEKALI dari transaction_payments.amount dan tidak
// pernah dikoreksi. Kalau harga deal transaksi diedit setelah pembayaran tercatat (mis. salah
// input 20.712 → 207.712), baris pembayaran tetap nominal lama, syncTransactionEntries men-skip
// invoice yang punya baris pembayaran, dan syncTransactionPaymentEntries hanya insert yang belum
// ada → Cashflow nyangkut di nominal lama. Di sini selisih (harga deal − total tercatat)
// ditambahkan ke entri pembayaran TERAKHIR. Idempotent: setelah dikoreksi selisih jadi 0.
async function syncEditedDealPaymentEntries(supabase: SupabaseClient) {
    let paidTx: any[];
    try {
        paidTx = await fetchAllRows<any>((from, to) =>
            supabase
                .from("transactions")
                .select("id, invoice_number, deal_price, amount")
                .eq("status", "PAID")
                .gte("created_at", `${CASHFLOW_START_DATE}T00:00:00+07:00`)
                .order("id", { ascending: true })
                .range(from, to)
        );
    } catch (e: any) {
        console.error("[cashflow sync] fetch paid transactions (edited deal) error:", e?.message ?? e);
        return;
    }
    if (paidTx.length === 0) return;

    const dealByInvoice = new Map<string, number>(
        paidTx.map((t: any) => [t.invoice_number as string, Math.round(Number(t.deal_price ?? t.amount ?? 0))])
    );

    const { rows: payRows, ok: okPay } = await selectInChunks<any>(
        Array.from(dealByInvoice.keys()),
        (chunk) => supabase.from("transaction_payments").select("id, invoice_number, created_at").in("invoice_number", chunk)
    );
    if (!okPay || payRows.length === 0) return;

    const invoiceOfPayment = new Map<string, string>();
    const paymentCreatedAt = new Map<string, string>();
    const paymentCountByInvoice = new Map<string, number>();
    for (const p of payRows) {
        invoiceOfPayment.set(p.id as string, p.invoice_number as string);
        paymentCreatedAt.set(p.id as string, p.created_at as string);
        paymentCountByInvoice.set(p.invoice_number as string, (paymentCountByInvoice.get(p.invoice_number as string) ?? 0) + 1);
    }

    const [payEntriesRes, invEntriesRes] = await Promise.all([
        selectInChunks<any>(
            payRows.map((p: any) => p.id as string),
            (chunk) =>
                supabase
                    .from("cashflow_entries")
                    .select("id, source_id, nominal")
                    .eq("source_type", "TRANSACTION_PAYMENT")
                    .in("source_id", chunk)
        ),
        selectInChunks<any>(
            Array.from(paymentCountByInvoice.keys()),
            (chunk) =>
                supabase
                    .from("cashflow_entries")
                    .select("source_type, source_id, nominal")
                    .in("source_type", ["TRANSACTION_DP", "TRANSACTION", "TRANSACTION_REFUND"])
                    .in("source_id", chunk)
        ),
    ]);
    if (!payEntriesRes.ok || !invEntriesRes.ok) return; // ⬅️ fail-closed

    const skipInvoices = new Set<string>(); // sudah ada entri TRANSACTION / REFUND → jangan disentuh
    const dpNominal = new Map<string, number>();
    for (const e of invEntriesRes.rows) {
        if (e.source_type === "TRANSACTION_DP") {
            dpNominal.set(e.source_id as string, (dpNominal.get(e.source_id as string) ?? 0) + Math.round(Number(e.nominal ?? 0)));
        } else {
            skipInvoices.add(e.source_id as string);
        }
    }

    const entriesByInvoice = new Map<string, any[]>();
    for (const e of payEntriesRes.rows) {
        const inv = invoiceOfPayment.get(e.source_id as string);
        if (!inv) continue;
        const list = entriesByInvoice.get(inv) ?? [];
        list.push(e);
        entriesByInvoice.set(inv, list);
    }

    const updates: { id: string; nominal: number }[] = [];
    for (const [inv, list] of entriesByInvoice) {
        if (skipInvoices.has(inv)) continue;
        // pengaman: jumlah entri harus sama dengan jumlah baris pembayaran (kalau belum, tunggu sinkron berikutnya)
        if (list.length !== (paymentCountByInvoice.get(inv) ?? 0)) continue;

        const deal = dealByInvoice.get(inv) ?? 0;
        if (deal <= 0) continue;

        const posted =
            (dpNominal.get(inv) ?? 0) + list.reduce((s: number, e: any) => s + Math.round(Number(e.nominal ?? 0)), 0);
        const gap = deal - posted;
        if (gap === 0) continue;

        const sorted = [...list].sort((a, b) =>
            String(paymentCreatedAt.get(a.source_id as string)) < String(paymentCreatedAt.get(b.source_id as string)) ? -1 : 1
        );
        const last = sorted[sorted.length - 1];
        const current = Math.round(Number(last.nominal ?? 0));
        const next = Math.max(0, current + gap);
        if (next !== current) updates.push({ id: last.id as string, nominal: next });
    }

    if (updates.length === 0) return;
    const results = await Promise.allSettled(
        updates.map((u) => supabase.from("cashflow_entries").update({ nominal: u.nominal }).eq("id", u.id))
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(`[cashflow sync] reconciled ${updates.length - failed} edited-deal payment entries`);
    if (failed > 0) console.error(`[cashflow sync] ${failed} reconcile edited-deal payment GAGAL`);
}

async function syncDerivedEntries(supabase: SupabaseClient) {
    await syncLegacyDpEntries(supabase);
    await syncTransactionEntries(supabase);
    await syncTransactionPaymentEntries(supabase);
    await syncEditedDealPaymentEntries(supabase); // ⬅️ BARU

    // ⬅️ FIX: dulu pakai .select() biasa tanpa pagination → PostgREST default
    // limit 1000 baris/query, jadi kalau service SUDAH_DIAMBIL + payment_amount>0
    // sudah lebih dari 1000, sisanya kepotong diam-diam & TIDAK PERNAH direkonsiliasi.
    // Ditambah tidak ada .order() eksplisit, jadi baris mana yg "kepilih" masuk 1000
    // pertama itu tidak konsisten antar-request — makanya kelihatan "acak" mana yang
    // ke-update mana yang enggak. fetchAllRows menangani pagination-nya otomatis,
    // sama seperti fix yang sudah dipakai buat fetch cashflow_entries di atas.
    let services: any[] = [];
    try {
        services = await fetchAllRows<any>((from, to) =>
            supabase
                .from("service_orders")
                .select(`
                    id,
                    nama,
                    payment_amount,
                    payment_method,
                    tanggal_selesai,
                    tanggal_diambil,
                    tanggal_masuk,
                    status,
                    payment_status,
                    payment_confirmed_at,
                    total_tagihan,
                    dikerjakan_by,
                    dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(id, name)
                `)
                .or("payment_status.eq.DP,status.eq.SUDAH_DIAMBIL,and(payment_status.eq.LUNAS,tanggal_masuk.gte.2026-09-28T17:00:00Z)")
                .not("payment_amount", "is", null)
                .gte("payment_amount", 0)   // ⬅️ FIX: dulu .gt(0) — service yang payment_amount-nya
                // diedit JADI 0 tidak pernah ke-fetch sama sekali, jadi
                // tidak pernah sampai direkonsiliasi ke Cashflow.
                .order("id", { ascending: true })
                .range(from, to)
        );
    } catch (svcError: any) {
        console.error("[cashflow sync] fetch service error:", svcError?.message ?? svcError);

        try {
            const servicesFallback = await fetchAllRows<any>((from, to) =>
                supabase
                    .from("service_orders")
                    .select("id, nama, payment_amount, payment_method, tanggal_selesai, tanggal_diambil, tanggal_masuk, status, payment_status, payment_confirmed_at, total_tagihan, dikerjakan_by")
                    .or("payment_status.eq.DP,status.eq.SUDAH_DIAMBIL,and(payment_status.eq.LUNAS,tanggal_masuk.gte.2026-09-28T17:00:00Z)")
                    .not("payment_amount", "is", null)
                    .gte("payment_amount", 0)   // ⬅️ FIX: sama seperti query utama di atas
                    .order("id", { ascending: true })
                    .range(from, to)
            );
            if (servicesFallback.length > 0) {
                await syncServiceEntries(supabase, servicesFallback, new Map());
            }
        } catch (svcFbError: any) {
            console.error("[cashflow sync] fetch service fallback error:", svcFbError?.message ?? svcFbError);
        }
        return;
    }

    if (services.length > 0) {
        const technicianNameMap = new Map<string, string>();
        for (const svc of services as any[]) {
            const techName = getJoinedName(svc.dikerjakan_by_user);
            if (svc.dikerjakan_by && techName) {
                technicianNameMap.set(svc.dikerjakan_by as string, techName);
            }
        }
        await syncServiceEntries(supabase, services as any[], technicianNameMap);
    }
}

// ⬅️ BARU: cegah sync berat jalan dobel/bertumpuk (banyak tab, polling, banyak user).
// - Kalau sync sedang jalan → request lain NUNGGU sync yang sama, bukan bikin baru.
// - Kalau sync baru selesai < 30 dtk lalu → skip (kecuali forceSync=1).
let syncInFlight: Promise<void> | null = null;
let lastSyncAt = 0;
const SYNC_MIN_INTERVAL_MS = 30_000;

async function runSyncThrottled(supabase: SupabaseClient, force = false): Promise<void> {
    if (syncInFlight) return syncInFlight;
    if (!force && Date.now() - lastSyncAt < SYNC_MIN_INTERVAL_MS) return;

    syncInFlight = (async () => {
        try {
            await syncDerivedEntries(supabase);
        } catch (e) {
            console.error("[cashflow sync]", e);
        } finally {
            lastSyncAt = Date.now();
            syncInFlight = null;
        }
    })();
    return syncInFlight;
}

// ── GET /api/cashflow ──────────────────────────────────────────────────────
export const GET = withAuth(async (req) => {
    const supabase = getAdmin();

    // ⬅️ FIX: ?skipSync=1 melewati sinkronisasi berat (scan transactions/
    // payments/service + reconcile ribuan baris) supaya load PERTAMA halaman
    // Cashflow cepat — cukup baca cashflow_entries yang sudah ada. Sync penuh
    // dipicu terpisah di background oleh frontend (lihat fetchData di page.tsx).
    const url = new URL(req.url);
    const skipSync = url.searchParams.get("skipSync") === "1";
    const forceSync = url.searchParams.get("forceSync") === "1";

    if (!skipSync) {
        await runSyncThrottled(supabase, forceSync);
    }
    // fetchAllRows: hindari truncation 1000 baris yang bikin saldo salah hitung.
    let rawAll: any[];
    try {
        rawAll = await fetchAllRows<any>((from, to) =>
            supabase
                .from("cashflow_entries")
                .select(`
                    *,
                    created_by_user:users!cashflow_entries_created_by_fkey(id, name),
                    audited_by_user:users!cashflow_entries_audited_by_fkey(id, name)
                `)
                .order("tanggal", { ascending: false })
                .order("created_at", { ascending: false })
                .order("id", { ascending: false })
                .range(from, to)
        );
    } catch (error: any) {
        console.error("[cashflow GET]", error);
        return NextResponse.json({ success: false, message: error?.message ?? "Gagal memuat cashflow" }, { status: 500 });
    }

    const txSourceIds = Array.from(
        new Set(
            rawAll
                .filter((e: any) => (e.source_type === "TRANSACTION" || e.source_type === "TRANSACTION_DP") && e.source_id)
                .map((e: any) => e.source_id as string)
        )
    );

    const paymentSourceIds = Array.from(
        new Set(
            rawAll
                .filter((e: any) => e.source_type === "TRANSACTION_PAYMENT" && e.source_id)
                .map((e: any) => e.source_id as string)
        )
    );

    // Entry pembayaran (source_id = id baris transaction_payments) perlu di-lookup dulu
    // ke invoice_number-nya sebelum bisa cek status transaksi induk.
    const paymentInvoiceMap = new Map<string, string>();
    if (paymentSourceIds.length > 0) {
        const { rows: paymentRows } = await selectInChunks<any>(paymentSourceIds, (chunk) =>
            supabase.from("transaction_payments").select("id, invoice_number").in("id", chunk)
        );
        for (const p of paymentRows) {
            paymentInvoiceMap.set(p.id as string, p.invoice_number as string);
        }
    }

    const allInvoiceNumbers = Array.from(
        new Set([...txSourceIds, ...Array.from(paymentInvoiceMap.values())])
    );

    const txMap = new Map<string, { status: string; nominal: number; paymentMethod: string }>();
    if (allInvoiceNumbers.length > 0) {
        const { rows: linkedTx } = await selectInChunks<any>(allInvoiceNumbers, (chunk) =>
            supabase
                .from("transactions")
                .select("invoice_number, status, deal_price, amount, payment_method, payment_method_2")
                .in("invoice_number", chunk)
        );

        for (const t of linkedTx) {
            // formatTxPaymentMethod scan payment_method + payment_method_2 langsung
            // (sama seperti getPaymentStyle di Riwayat Transaksi) — tidak butuh cek
            // amount_method_1/2 lagi, karena itu bukan penentu split yang sebenarnya.
            txMap.set(t.invoice_number as string, {
                status: t.status as string,
                nominal: Math.round(Number((t as any).deal_price ?? (t as any).amount ?? 0)),
                paymentMethod: formatTxPaymentMethod(
                    (t as any).payment_method as string,
                    (t as any).payment_method_2 as string
                ),
            });
        }
    }

    // Invoice yang SUDAH punya entry refund otomatis (uang keluar saat batal).
    // Kalau refund-nya ada → pemasukan asli TIDAK di-void lagi (tetap dihitung di
    // tanggal aslinya), dan entry TRANSACTION_REFUND yang jadi penyeimbang di
    // tanggal cancel. Kalau BELUM ada refund (cancel lama) → perilaku lama dipakai.
    const refundedInvoices = new Set<string>(
        rawAll
            .filter((e: any) => e.source_type === "TRANSACTION_REFUND" && e.source_id)
            .map((e: any) => e.source_id as string)
    );

    const all = rawAll.map((e: any) => {
        if (e.source_type === "TRANSACTION" && e.source_id) {
            const tx = txMap.get(e.source_id as string);
            const isVoided = !!tx && tx.status !== "PAID" && !refundedInvoices.has(e.source_id as string);
            const isStale =
                !!tx &&
                !isVoided &&
                e.is_audited &&
                Number(e.nominal ?? 0) !== tx.nominal;

            return { ...e, is_voided: isVoided, is_stale: isStale, source_nominal: tx?.nominal ?? null, tx_payment_method: tx?.paymentMethod ?? null, invoice_number: e.source_id as string };
        }

        if (e.source_type === "TRANSACTION_PAYMENT" && e.source_id) {
            const invoiceNumber = paymentInvoiceMap.get(e.source_id as string);
            const tx = invoiceNumber ? txMap.get(invoiceNumber) : undefined;
            const isVoided = !!tx && tx.status === "CANCELLED" && !(invoiceNumber && refundedInvoices.has(invoiceNumber));
            return { ...e, is_voided: isVoided, is_stale: false, source_nominal: null, tx_payment_method: tx?.paymentMethod ?? null, invoice_number: invoiceNumber ?? null };
        }

        if (e.source_type === "TRANSACTION_DP" && e.source_id) {
            const tx = txMap.get(e.source_id as string);
            const isVoided = !!tx && tx.status === "CANCELLED" && !refundedInvoices.has(e.source_id as string);
            return { ...e, is_voided: isVoided, is_stale: false, source_nominal: null, tx_payment_method: tx?.paymentMethod ?? null, invoice_number: e.source_id as string };
        }

        // Refund otomatis: uang keluar penyeimbang saat transaksi dibatalkan.
        // Selalu dihitung (tidak pernah di-void), source_id = invoice.
        if (e.source_type === "TRANSACTION_REFUND" && e.source_id) {
            return { ...e, is_voided: false, is_stale: false, source_nominal: null, tx_payment_method: null, invoice_number: e.source_id as string };
        }

        return { ...e, is_voided: false, is_stale: false };
    });

    const masuk = all.filter((e: any) => e.direction === "IN");
    const keluar = all.filter((e: any) => e.direction === "OUT");

    // ✅ FIX: entry yang is_stale (sudah diaudit, tapi harga di transaksi/service sumbernya
    // berubah belakangan — badge "Kini Rp2.850.000" di tabel) dihitung pakai
    // source_nominal (harga TERKINI di tabel transactions / service_orders), bukan nominal yang
    // ter-lock saat audit. Supaya Saldo Cashflow selalu mencerminkan uang yang
    // benar-benar diterima sekarang, bukan angka lama yang sudah usang.
    const effectiveNominal = (e: any) =>
        e.is_stale && e.source_nominal != null ? Number(e.source_nominal) : Number(e.nominal || 0);

    const totalMasuk = masuk.reduce(
        (s: number, e: any) => (e.is_voided ? s : s + effectiveNominal(e)),
        0
    );
    // ✅ FIX: totalKeluar dulu tidak cek is_voided sama sekali (beda dari totalMasuk
    // di atas yang sudah benar) — kalau nanti ada entry OUT yang bisa di-void, nominalnya
    // ikut kehitung ke saldo padahal seharusnya tidak. Disamakan dengan expenseValue
    // di page.tsx yang sudah lebih dulu diperbaiki begini.
    const totalKeluar = keluar.reduce(
        (s: number, e: any) => (e.is_voided ? s : s + Number(e.nominal || 0)),
        0
    );

    const modalAwalEntry = all.find((e: any) => e.source_type === "MODAL_AWAL") ?? null;

    return NextResponse.json({
        success: true,
        data: { masuk, keluar },
        summary: {
            total_masuk: totalMasuk,
            total_keluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            belum_audit: all.filter((e: any) => !e.is_audited && !e.is_voided).length,
            stale: all.filter((e: any) => e.is_stale).length,
            modal_awal_entry: modalAwalEntry,
        },
    });
}, CASHFLOW_ROLES);

// ── POST /api/cashflow ─────────────────────────────────────────────────────
export const POST = withAuth(async (req, _ctx, user: any) => {
    const body = await req.json();
    const { direction, category, nominal, keterangan, tanggal } = body as {
        direction: string;
        category: string;
        nominal: number | string;
        keterangan?: string;
        tanggal?: string;
    };

    const nom = Math.round(Number(nominal));
    if (!Number.isFinite(nom) || nom <= 0)
        return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });

    const supabase = getAdmin();
    const userName = (user?.name && String(user.name).trim()) || "—";
    const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    // ── Special case: Modal Awal ───────────────────────────────────────────
    if (direction === "IN" && category === "MODAL_AWAL") {
        if (!isModalAwalActive())
            return NextResponse.json(
                { success: false, message: "Periode input modal awal sudah berakhir (aktif 08–09 Jul 2026)" },
                { status: 400 }
            );

        const { count, error: countErr } = await supabase
            .from("cashflow_entries")
            .select("id", { count: "exact", head: true })
            .eq("source_type", "MODAL_AWAL");

        // ✅ FIX: dulu error query TIDAK dicek — kalau gagal, `count` undefined →
        // `(count ?? 0) > 0` = false → tetap lanjut insert (fail-open), padahal
        // Modal Awal mungkin sudah ada. Sekarang fail-closed: kalau tidak bisa
        // memverifikasi, tolak daripada berisiko dobel.
        if (countErr)
            return NextResponse.json(
                { success: false, message: "Gagal memverifikasi status modal awal. Coba lagi." },
                { status: 503 }
            );

        if ((count ?? 0) > 0)
            return NextResponse.json(
                { success: false, message: "Modal awal sudah pernah diisi. Tidak dapat diubah." },
                { status: 400 }
            );

        const { data: inserted, error } = await supabase
            .from("cashflow_entries")
            .insert({
                direction: "IN",
                category: "MODAL_AWAL",
                nama: userName,
                nominal: nom,
                modal: null,
                keterangan: keterangan?.trim() || "Modal awal cashflow",
                tanggal: tanggal || jakartaToday,
                source_type: "MODAL_AWAL",
                source_id: null,
                created_by: user.id,
                is_audited: false,
            })
            .select(`*, created_by_user:users!cashflow_entries_created_by_fkey(id, name)`)
            .single();

        if (error) {
            console.error("[cashflow POST modal_awal]", error);
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: inserted }, { status: 201 });
    }

    // ── Uang Masuk Manual ──────────────────────────────────────────────────
    // Boleh: AKSESORIS, UTANG, SEWA, PENJUALAN_ASET, BIAYA_LAIN
    // Tidak boleh: PENJUALAN_LAPTOP, SERVICE (auto-sync dari sistem)
    if (direction === "IN") {
        if (!isManualIncomeCategory(category))
            return NextResponse.json(
                { success: false, message: "Kategori ini tidak bisa diinput manual (auto-sync dari sistem)" },
                { status: 400 }
            );

        const pm = (body.payment_method as string | undefined) ?? "CASH";
        if (!["CASH", "SALDO"].includes(pm))
            return NextResponse.json(
                { success: false, message: "Metode pembayaran harus CASH atau SALDO" },
                { status: 400 }
            );

        const { data, error } = await supabase
            .from("cashflow_entries")
            .insert({
                direction: "IN",
                category,
                nama: userName,
                nominal: nom,
                modal: null,
                keterangan: keterangan?.trim() || null,
                tanggal: tanggal || jakartaToday,
                source_type: "MANUAL",
                payment_method: pm,
                photo_url: (body.photo_url as string | undefined) ?? null, // ⬅️ BARU: foto bukti Uang Masuk
                created_by: user.id,
            })
            .select(`*, created_by_user:users!cashflow_entries_created_by_fkey(id, name)`)
            .single();

        if (error) {
            console.error("[cashflow POST income]", error);
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data }, { status: 201 });
    }

    // ── Uang Keluar Manual ─────────────────────────────────────────────────
    if (direction !== "OUT")
        return NextResponse.json({ success: false, message: "Direction tidak valid" }, { status: 400 });

    if (!isValidCategory(direction, category))
        return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });

    const pm = body.payment_method as string | undefined;
    if (!pm || !["CASH", "SALDO"].includes(pm))
        return NextResponse.json(
            { success: false, message: "Metode pembayaran harus CASH atau SALDO" },
            { status: 400 }
        );

    const photoUrl = (body.photo_url as string | undefined) ?? null;

    const { data, error } = await supabase
        .from("cashflow_entries")
        .insert({
            direction,
            category,
            nama: userName,
            nominal: nom,
            modal: null,
            keterangan: keterangan?.trim() || null,
            tanggal: tanggal || jakartaToday,
            source_type: "MANUAL",
            payment_method: pm,
            photo_url: photoUrl,
            created_by: user.id,
        })
        .select(`*, created_by_user:users!cashflow_entries_created_by_fkey(id, name)`)
        .single();

    if (error) {
        console.error("[cashflow POST]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
}, CASHFLOW_ROLES);