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
} from "@/lib/cashflow";
import { fetchAllRows } from "@/lib/supabaseFetch";

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

const jakartaDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

function getJoinedName(joined: any): string | null {
    if (!joined) return null;
    if (Array.isArray(joined)) {
        return (joined[0] as { id: string; name: string } | undefined)?.name ?? null;
    }
    return (joined as { id: string; name: string }).name ?? null;
}

function buildTxPayload(t: any) {
    const refDate = (t.paid_at || t.created_at) as string;
    return {
        direction: "IN",
        category: "PENJUALAN_LAPTOP",
        nama: (t.sales_name as string) || "Sales",
        nominal: Math.round(Number(t.deal_price ?? t.amount ?? 0)),
        modal: null,
        keterangan: `Penjualan laptop · ${t.invoice_number} · ${(t.customer_name as string) || "—"}`,
        tanggal: jakartaDate(refDate),
        source_type: "TRANSACTION",
        source_id: t.invoice_number as string,
        payment_method: null,
    };
}

function buildSvcPayload(s: any, techName: string) {
    const refDate = (s.tanggal_selesai || s.tanggal_diambil || s.tanggal_masuk) as string;
    return {
        direction: "IN",
        category: "SERVICE",
        nama: techName,
        nominal: Math.round(Number(s.payment_amount ?? 0)),
        modal: null,
        keterangan: `Service · ${(s.nama as string) || "—"} · ${(s.payment_method as string) || "—"}`,
        tanggal: jakartaDate(refDate),
        source_type: "SERVICE",
        source_id: String(s.id),
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
    const { data: transactions, error } = await supabase
        .from("transactions")
        .select("invoice_number, customer_name, sales_name, deal_price, amount, created_at, paid_at, status")
        .eq("status", "PAID")
        .gte("created_at", `${CASHFLOW_START_DATE}T00:00:00+07:00`);

    if (error) {
        console.error("[cashflow sync] fetch transactions error:", error.message);
        return;
    }
    if (!transactions || transactions.length === 0) return;

    const { data: paidInvoicesWithPayments } = await supabase
        .from("transaction_payments")
        .select("invoice_number")
        .in("invoice_number", transactions.map((t: any) => t.invoice_number as string));
    const invoicesWithPayments = new Set((paidInvoicesWithPayments ?? []).map((p: any) => p.invoice_number as string));
    const transactionsToSync = (transactions as any[]).filter((t) => !invoicesWithPayments.has(t.invoice_number as string));
    if (transactionsToSync.length === 0) return;

    const invoices = transactionsToSync.map((t: any) => t.invoice_number as string);

    const { data: existing } = await supabase
        .from("cashflow_entries")
        .select("id, source_id, nominal, nama, keterangan, tanggal, category, is_audited")
        .eq("source_type", "TRANSACTION")
        .in("source_id", invoices);

    const existingMap = new Map<string, any>(
        (existing ?? []).map((e: any) => [e.source_id as string, e])
    );

    const toInsert: any[] = [];
    const updates: { id: string; patch: Record<string, any> }[] = [];

    for (const t of transactionsToSync) {
        const desired = buildTxPayload(t);
        if (desired.nominal <= 0 || desired.tanggal < CASHFLOW_START_DATE) continue;

        const cur = existingMap.get(t.invoice_number as string);

        if (!cur) {
            toInsert.push({ ...desired, is_audited: false });
            continue;
        }
        if (cur.is_audited) continue;

        const patch = diffPayload(cur, desired);
        if (Object.keys(patch).length > 0) updates.push({ id: cur.id, patch });
    }

    if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("cashflow_entries").insert(toInsert);
        if (insErr) console.error("[cashflow sync] insert transactions error:", insErr.message);
        else console.log(`[cashflow sync] inserted ${toInsert.length} transaction entries`);
    }

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

async function syncServiceEntries(
    supabase: SupabaseClient,
    services: any[],
    technicianNameMap: Map<string, string>
) {
    if (services.length === 0) return;

    const serviceIds = services.map((s: any) => String(s.id));

    const { data: existing } = await supabase
        .from("cashflow_entries")
        .select("id, source_id, nominal, nama, keterangan, tanggal, category, is_audited")
        .eq("source_type", "SERVICE")
        .in("source_id", serviceIds);

    const existingMap = new Map<string, any>(
        (existing ?? []).map((e: any) => [e.source_id as string, e])
    );

    const toInsert: any[] = [];
    const updates: { id: string; patch: Record<string, any> }[] = [];

    for (const s of services) {
        let techName = "Teknisi";
        if (s.dikerjakan_by && technicianNameMap.has(s.dikerjakan_by as string)) {
            techName = technicianNameMap.get(s.dikerjakan_by as string)!;
        } else {
            const joinedName = getJoinedName(s.dikerjakan_by_user);
            if (joinedName) techName = joinedName;
        }

        const desired = buildSvcPayload(s, techName);
        if (desired.nominal <= 0 || desired.tanggal < CASHFLOW_START_DATE) continue;

        const cur = existingMap.get(String(s.id));

        if (!cur) {
            toInsert.push({ ...desired, is_audited: false });
            continue;
        }
        if (cur.is_audited) continue;

        const patch = diffPayload(cur, desired);
        if (Object.keys(patch).length > 0) updates.push({ id: cur.id, patch });
    }

    if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("cashflow_entries").insert(toInsert);
        if (insErr) console.error("[cashflow sync] insert service entries error:", insErr.message);
        else console.log(`[cashflow sync] inserted ${toInsert.length} service entries`);
    }

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

function buildPaymentPayload(p: any, customerName: string, salesName: string) {
    return {
        direction: "IN",
        category: "PENJUALAN_LAPTOP",
        nama: salesName || "Sales",
        nominal: Math.round(Number(p.amount ?? 0)),
        modal: null,
        keterangan: `${p.payment_type === "DP" ? "DP" : p.payment_type === "CICILAN" ? "Cicilan" : "Pelunasan"} · ${p.invoice_number} · ${customerName || "—"}`,
        tanggal: jakartaDate(p.created_at),
        source_type: "TRANSACTION_PAYMENT",
        source_id: p.id as string,
        payment_method: null,
    };
}

async function syncLegacyDpPayments(supabase: SupabaseClient) {
    const { data: pendingTx, error } = await supabase
        .from("transactions")
        .select("id, invoice_number, dp_amount, status, created_at")
        .in("status", ["RESERVED", "HELD", "PACKING"]);

    if (error) {
        console.error("[cashflow sync] fetch legacy DP transactions error:", error.message);
        return;
    }
    if (!pendingTx || pendingTx.length === 0) return;

    const withDp = pendingTx.filter((t: any) => Number(t.dp_amount) > 0);
    if (withDp.length === 0) return;

    const invoices = withDp.map((t: any) => t.invoice_number as string);
    const { data: existingPayments } = await supabase
        .from("transaction_payments")
        .select("invoice_number")
        .in("invoice_number", invoices);

    const covered = new Set((existingPayments ?? []).map((p: any) => p.invoice_number as string));
    const missing = withDp.filter((t: any) => !covered.has(t.invoice_number as string));
    if (missing.length === 0) return;

    const toInsert = missing.map((t: any) => ({
        transaction_id: t.id,
        invoice_number: t.invoice_number,
        amount: Math.round(Number(t.dp_amount)),
        payment_type: "DP",
        created_by_name: "System (backfill)",
        notes: "Backfill otomatis dari status DP transaksi (data lama)",
        created_at: t.created_at,
    }));

    const { error: insErr } = await supabase.from("transaction_payments").insert(toInsert);
    if (insErr) console.error("[cashflow sync] backfill DP insert error:", insErr.message);
    else console.log(`[cashflow sync] backfilled ${toInsert.length} legacy DP payments`);
}

async function syncTransactionPaymentEntries(supabase: SupabaseClient) {
    const { data: payments, error } = await supabase
        .from("transaction_payments")
        .select("id, invoice_number, amount, payment_type, created_at")
        .gte("created_at", `${CASHFLOW_START_DATE}T00:00:00+07:00`);

    if (error) {
        console.error("[cashflow sync] fetch transaction_payments error:", error.message);
        return;
    }
    if (!payments || payments.length === 0) return;

    const paymentIds = payments.map((p: any) => p.id as string);
    const { data: existing } = await supabase
        .from("cashflow_entries")
        .select("id, source_id")
        .eq("source_type", "TRANSACTION_PAYMENT")
        .in("source_id", paymentIds);

    const existingIds = new Set((existing ?? []).map((e: any) => e.source_id as string));
    const missing = payments.filter((p: any) => !existingIds.has(p.id as string));
    if (missing.length === 0) return;

    const invoiceNumbers = [...new Set(missing.map((p: any) => p.invoice_number as string))];
    const { data: txRows } = await supabase
        .from("transactions")
        .select("invoice_number, customer_name, sales_name")
        .in("invoice_number", invoiceNumbers);
    const txInfoMap = new Map<string, { customer_name: string; sales_name: string }>(
        (txRows ?? []).map((t: any) => [t.invoice_number as string, t])
    );

    const toInsert = missing
        .map((p: any) => {
            const info = txInfoMap.get(p.invoice_number as string);
            return buildPaymentPayload(p, info?.customer_name ?? "—", info?.sales_name ?? "Sales");
        })
        .filter((e) => e.nominal > 0 && e.tanggal >= CASHFLOW_START_DATE)
        .map((e) => ({ ...e, is_audited: false }));

    if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("cashflow_entries").insert(toInsert);
        if (insErr) console.error("[cashflow sync] insert payment entries error:", insErr.message);
        else console.log(`[cashflow sync] inserted ${toInsert.length} payment entries`);
    }
}

async function syncDerivedEntries(supabase: SupabaseClient) {
    await syncLegacyDpPayments(supabase);
    await syncTransactionEntries(supabase);
    await syncTransactionPaymentEntries(supabase);

    const { data: services, error: svcError } = await supabase
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
            dikerjakan_by,
            dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(id, name)
        `)
        .in("status", ["DONE", "SUDAH_DIAMBIL"])
        .not("payment_amount", "is", null)
        .gt("payment_amount", 0);

    if (svcError) {
        console.error("[cashflow sync] fetch service error:", svcError.message);

        const { data: servicesFallback, error: svcFbError } = await supabase
            .from("service_orders")
            .select("id, nama, payment_amount, payment_method, tanggal_selesai, tanggal_diambil, tanggal_masuk, status, dikerjakan_by")
            .in("status", ["DONE", "SUDAH_DIAMBIL"])
            .not("payment_amount", "is", null)
            .gt("payment_amount", 0);

        if (svcFbError) {
            console.error("[cashflow sync] fetch service fallback error:", svcFbError.message);
        } else if (servicesFallback && servicesFallback.length > 0) {
            await syncServiceEntries(supabase, servicesFallback, new Map());
        }
        return;
    }

    if (services && services.length > 0) {
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

// ── GET /api/cashflow ──────────────────────────────────────────────────────
export const GET = withAuth(async () => {
    const supabase = getAdmin();

    try {
        await syncDerivedEntries(supabase);
    } catch (e) {
        console.error("[cashflow sync]", e);
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
                .filter((e: any) => e.source_type === "TRANSACTION" && e.source_id)
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
        const { data: paymentRows } = await supabase
            .from("transaction_payments")
            .select("id, invoice_number")
            .in("id", paymentSourceIds);
        for (const p of paymentRows ?? []) {
            paymentInvoiceMap.set(p.id as string, p.invoice_number as string);
        }
    }

    const allInvoiceNumbers = Array.from(
        new Set([...txSourceIds, ...Array.from(paymentInvoiceMap.values())])
    );

    const txMap = new Map<string, { status: string; nominal: number }>();
    if (allInvoiceNumbers.length > 0) {
        const { data: linkedTx } = await supabase
            .from("transactions")
            .select("invoice_number, status, deal_price, amount")
            .in("invoice_number", allInvoiceNumbers);

        for (const t of linkedTx ?? []) {
            txMap.set(t.invoice_number as string, {
                status: t.status as string,
                nominal: Math.round(Number((t as any).deal_price ?? (t as any).amount ?? 0)),
            });
        }
    }

    const all = rawAll.map((e: any) => {
        if (e.source_type === "TRANSACTION" && e.source_id) {
            const tx = txMap.get(e.source_id as string);
            const isVoided = !!tx && tx.status !== "PAID";
            const isStale =
                !!tx &&
                !isVoided &&
                e.is_audited &&
                Number(e.nominal ?? 0) !== tx.nominal;

            return { ...e, is_voided: isVoided, is_stale: isStale, source_nominal: tx?.nominal ?? null };
        }

        if (e.source_type === "TRANSACTION_PAYMENT" && e.source_id) {
            const invoiceNumber = paymentInvoiceMap.get(e.source_id as string);
            const tx = invoiceNumber ? txMap.get(invoiceNumber) : undefined;
            const isVoided = !!tx && tx.status === "CANCELLED";
            return { ...e, is_voided: isVoided, is_stale: false, source_nominal: null };
        }

        return { ...e, is_voided: false, is_stale: false };
    });

    const masuk = all.filter((e: any) => e.direction === "IN");
    const keluar = all.filter((e: any) => e.direction === "OUT");

    const totalMasuk = masuk.reduce(
        (s: number, e: any) => (e.is_voided ? s : s + Number(e.nominal || 0)),
        0
    );
    const totalKeluar = keluar.reduce((s: number, e: any) => s + Number(e.nominal || 0), 0);

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

        const { count } = await supabase
            .from("cashflow_entries")
            .select("id", { count: "exact", head: true })
            .eq("source_type", "MODAL_AWAL");

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
                payment_method: null,
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