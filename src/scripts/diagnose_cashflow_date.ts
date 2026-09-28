// src/scripts/diagnose_cashflow_date.ts
// Cek kenapa data Cashflow di tanggal tertentu tidak muncul.
// Jalankan dari root project:
//   npx tsx src/scripts/diagnose_cashflow_date.ts 2026-09-27
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing Supabase credentials di .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TARGET = process.argv[2] ?? "2026-09-27";
const CASHFLOW_START_DATE = "2026-07-08";
const START_ISO = `${CASHFLOW_START_DATE}T00:00:00+07:00`;

function nextDate(d: string): string {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}
const DAY_START = `${TARGET}T00:00:00+07:00`;
const DAY_END = `${nextDate(TARGET)}T00:00:00+07:00`;

const jakartaDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) : "—";
const rp = (n: unknown) => `Rp${Number(n ?? 0).toLocaleString("id-ID")}`;

type CountResult = { count: number | null; error: { message: string } | null };

async function logCount(label: string, q: PromiseLike<CountResult>) {
    const { count, error } = await q;
    if (error) {
        console.log(`  ${label}: ERROR → ${error.message}`);
        return;
    }
    const warn = (count ?? 0) > 1000 ? "   ⚠️ >1000 — query sync tanpa pagination KEPOTONG" : "";
    console.log(`  ${label}: ${count}${warn}`);
}

async function main() {
    console.log(`\n=== DIAGNOSA CASHFLOW tanggal ${TARGET} ===`);
    console.log(`DB yang dipakai: ${new URL(SUPABASE_URL!).host}\n`);

    // ── [1] Volume data yang dibaca fungsi sync di /api/cashflow ─────────────
    console.log(`[1] Volume data sejak ${CASHFLOW_START_DATE}`);
    await logCount(
        "transactions PAID",
        supabase.from("transactions").select("invoice_number", { count: "exact", head: true })
            .eq("status", "PAID").gte("created_at", START_ISO)
    );
    await logCount(
        "transactions RESERVED/HELD/PACKING",
        supabase.from("transactions").select("invoice_number", { count: "exact", head: true })
            .in("status", ["RESERVED", "HELD", "PACKING"]).gte("created_at", START_ISO)
    );
    await logCount(
        "transaction_payments",
        supabase.from("transaction_payments").select("id", { count: "exact", head: true })
            .gte("created_at", START_ISO)
    );
    await logCount(
        "service_orders SUDAH_DIAMBIL",
        supabase.from("service_orders").select("id", { count: "exact", head: true })
            .eq("status", "SUDAH_DIAMBIL").not("payment_amount", "is", null)
    );

    // ── [2] Entry cashflow yang tercatat di tanggal target ───────────────────
    console.log(`\n[2] cashflow_entries dengan tanggal = ${TARGET}`);
    const { data: cfRows, error: cfErr } = await supabase
        .from("cashflow_entries")
        .select("id, direction, source_type, nominal, tanggal")
        .eq("tanggal", TARGET);
    if (cfErr) console.log("  ERROR →", cfErr.message);

    const bySource = new Map<string, { n: number; total: number }>();
    for (const e of cfRows ?? []) {
        const k = `${e.direction} ${e.source_type}`;
        const cur = bySource.get(k) ?? { n: 0, total: 0 };
        cur.n += 1;
        cur.total += Number(e.nominal ?? 0);
        bySource.set(k, cur);
    }
    if (bySource.size === 0) console.log("  (KOSONG — memang tidak ada entry di DB untuk tanggal ini)");
    bySource.forEach((v, k) => console.log(`  ${k}: ${v.n} entry, total ${rp(v.total)}`));

    const { data: shifted } = await supabase
        .from("cashflow_entries")
        .select("id, source_type, nominal, tanggal, created_at")
        .gte("created_at", DAY_START)
        .lt("created_at", DAY_END)
        .neq("tanggal", TARGET);
    if (shifted && shifted.length > 0) {
        console.log(`  ⚠️ ${shifted.length} entry DIBUAT tgl ${TARGET} tapi kolom tanggal-nya BEDA:`);
        for (const e of shifted) {
            console.log(`     ${e.source_type} ${rp(e.nominal)} → tanggal ${e.tanggal} (dibuat ${jakartaDate(e.created_at)} WIB)`);
        }
    }

    // ── [3] Transaksi di tanggal target & apakah sudah masuk Cashflow ────────
    console.log(`\n[3] Transaksi yang dibuat / dibayar tgl ${TARGET}`);
    const txCols = "invoice_number, customer_name, status, deal_price, amount, dp_amount, created_at, paid_at";
    const [byCreated, byPaid] = await Promise.all([
        supabase.from("transactions").select(txCols).gte("created_at", DAY_START).lt("created_at", DAY_END),
        supabase.from("transactions").select(txCols).gte("paid_at", DAY_START).lt("paid_at", DAY_END),
    ]);
    if (byCreated.error) console.log("  ERROR (created_at) →", byCreated.error.message);
    if (byPaid.error) console.log("  ERROR (paid_at) →", byPaid.error.message);

    const txMap = new Map<string, any>();
    for (const t of [...(byCreated.data ?? []), ...(byPaid.data ?? [])]) txMap.set(t.invoice_number as string, t);
    const txs = Array.from(txMap.values());

    if (txs.length === 0) {
        console.log("  (TIDAK ADA transaksi tanggal ini di DB ini — cek apakah data tgl ini masuk ke DB lama/baru)");
    } else {
        const invoices = txs.map((t) => t.invoice_number as string);
        const [{ data: txEntries }, { data: payRows }] = await Promise.all([
            supabase.from("cashflow_entries").select("source_type, source_id, nominal, tanggal")
                .in("source_type", ["TRANSACTION", "TRANSACTION_DP"]).in("source_id", invoices),
            supabase.from("transaction_payments").select("id, invoice_number, amount, created_at")
                .in("invoice_number", invoices),
        ]);

        const payIds = (payRows ?? []).map((p) => p.id as string);
        let payEntries: any[] = [];
        if (payIds.length > 0) {
            const r = await supabase.from("cashflow_entries").select("source_id, nominal, tanggal")
                .eq("source_type", "TRANSACTION_PAYMENT").in("source_id", payIds);
            payEntries = r.data ?? [];
        }

        for (const t of txs) {
            const inv = t.invoice_number as string;
            const txEntry = (txEntries ?? []).find((e) => e.source_type === "TRANSACTION" && e.source_id === inv);
            const dpEntry = (txEntries ?? []).find((e) => e.source_type === "TRANSACTION_DP" && e.source_id === inv);
            const pays = (payRows ?? []).filter((p) => p.invoice_number === inv);
            const paysSynced = pays.filter((p) => payEntries.some((e) => e.source_id === p.id)).length;
            const isPending = ["RESERVED", "HELD", "PACKING"].includes(t.status);

            let verdict: string;
            if (t.status === "CANCELLED") {
                verdict = "BATAL → entry jadi is_voided & disembunyikan filter default 'Aktif'";
            } else if (t.status !== "PAID" && !isPending) {
                verdict = `status ${t.status} → memang tidak di-sync ke Cashflow`;
            } else if (t.status === "PAID" && pays.length === 0 && !txEntry && !dpEntry) {
                verdict = "❌ HILANG — PAID tapi tidak ada entry TRANSACTION (bug limit 1000 / .in() gagal)";
            } else if (isPending && Number(t.dp_amount) > 0 && pays.length === 0 && !dpEntry) {
                verdict = "❌ HILANG — DP belum masuk Cashflow";
            } else if (pays.length > 0 && paysSynced < pays.length && !txEntry) {
                verdict = `❌ ${pays.length - paysSynced} dari ${pays.length} pembayaran belum masuk Cashflow`;
            } else if (txEntry && txEntry.tanggal !== TARGET) {
                verdict = `✅ ada, tapi tanggal entry = ${txEntry.tanggal} (bukan ${TARGET})`;
            } else {
                verdict = "✅ OK";
            }

            console.log(
                `  ${inv} | ${t.customer_name ?? "—"} | ${t.status} | dibuat ${jakartaDate(t.created_at)} | ` +
                `dibayar ${jakartaDate(t.paid_at)} | tanggal Cashflow seharusnya ${jakartaDate(t.paid_at || t.created_at)}`
            );
            console.log(`     → ${verdict}`);
        }
    }

    // ── [4] Service yang diambil di tanggal target ───────────────────────────
    console.log(`\n[4] Service SUDAH_DIAMBIL tgl ${TARGET}`);
    const { data: svcs, error: svcErr } = await supabase
        .from("service_orders")
        .select("id, nama, payment_amount, status, tanggal_diambil")
        .eq("status", "SUDAH_DIAMBIL")
        .gte("tanggal_diambil", DAY_START)
        .lt("tanggal_diambil", DAY_END);
    if (svcErr) console.log("  ERROR →", svcErr.message);

    if (svcs && svcs.length > 0) {
        const ids = svcs.map((s) => String(s.id));
        const { data: svcEntries } = await supabase
            .from("cashflow_entries")
            .select("source_id, nominal, tanggal")
            .eq("source_type", "SERVICE")
            .in("source_id", ids);
        for (const s of svcs) {
            const e = (svcEntries ?? []).find((x) => x.source_id === String(s.id));
            const verdict = Number(s.payment_amount ?? 0) <= 0
                ? "gratis/Rp0 → memang tidak dibuat entry"
                : e ? `✅ OK (${rp(e.nominal)}, tanggal ${e.tanggal})` : "❌ HILANG — belum masuk Cashflow";
            console.log(`  #${s.id} ${s.nama ?? "—"} ${rp(s.payment_amount)} → ${verdict}`);
        }
    } else {
        console.log("  (tidak ada)");
    }

    console.log("\nSelesai.\n");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});