// src/app/api/cashflow/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CASHFLOW_START_DATE, isValidCategory, isModalAwalActive, isManualIncomeCategory } from "@/lib/cashflow";

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// ── Helper: ambil name dari Supabase join (bisa array atau object) ──────────
// Supabase kadang menginfer relasi FK sebagai array meski hasilnya singular.
// Fungsi ini handle kedua kasus.
function getJoinedName(joined: any): string | null {
    if (!joined) return null;
    if (Array.isArray(joined)) {
        return (joined[0] as { id: string; name: string } | undefined)?.name ?? null;
    }
    return (joined as { id: string; name: string }).name ?? null;
}

// ── Sync transaksi & service → cashflow_entries ────────────────────────────
async function syncDerivedEntries(supabase: SupabaseClient) {

    // ── 1. Sync transaksi PAID ─────────────────────────────────────────────
    const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("invoice_number, customer_name, sales_name, deal_price, amount, created_at, paid_at, status")
        .eq("status", "PAID")
        .gte("created_at", `${CASHFLOW_START_DATE}T00:00:00+07:00`);

    if (txError) {
        console.error("[cashflow sync] fetch transactions error:", txError.message);
    } else if (transactions && transactions.length > 0) {
        const invoiceNumbers = transactions.map((t: any) => t.invoice_number as string);

        const { data: existingTx } = await supabase
            .from("cashflow_entries")
            .select("source_id")
            .eq("source_type", "TRANSACTION")
            .in("source_id", invoiceNumbers);

        const existingTxIds = new Set((existingTx ?? []).map((e: any) => e.source_id as string));

        const newTxEntries = transactions
            .filter((t: any) => !existingTxIds.has(t.invoice_number as string))
            .map((t: any) => {
                const refDate = (t.paid_at || t.created_at) as string;
                const tanggal = new Date(refDate).toLocaleDateString("en-CA", {
                    timeZone: "Asia/Jakarta",
                });
                return {
                    direction: "IN",
                    category: "PENJUALAN_LAPTOP",
                    // ✅ nama = sales yang melakukan transaksi
                    nama: (t.sales_name as string) || "Sales",
                    nominal: Math.round(Number(t.deal_price ?? t.amount ?? 0)),
                    modal: null,
                    // ✅ customer masuk ke keterangan
                    keterangan: `Penjualan laptop · ${t.invoice_number} · ${(t.customer_name as string) || "—"}`,
                    tanggal,
                    source_type: "TRANSACTION",
                    source_id: t.invoice_number as string,
                    is_audited: false,
                    payment_method: null,
                };
            })
            .filter((e: any) => e.nominal > 0 && e.tanggal >= CASHFLOW_START_DATE);

        if (newTxEntries.length > 0) {
            const { error: insertTxError } = await supabase
                .from("cashflow_entries")
                .insert(newTxEntries);

            if (insertTxError) {
                console.error("[cashflow sync] insert transactions error:", insertTxError.message);
            } else {
                console.log(`[cashflow sync] inserted ${newTxEntries.length} transaction entries`);
            }
        }
    }

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

        // Fallback tanpa join
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
    } else if (services && services.length > 0) {
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

async function syncServiceEntries(
    supabase: SupabaseClient,
    services: any[],
    technicianNameMap: Map<string, string>
) {
    const serviceIds = services.map((s: any) => String(s.id));

    const { data: existingSvc } = await supabase
        .from("cashflow_entries")
        .select("source_id")
        .eq("source_type", "SERVICE")
        .in("source_id", serviceIds);

    const existingSvcIds = new Set((existingSvc ?? []).map((e: any) => e.source_id as string));

    const newSvcEntries = services
        .filter((s: any) => !existingSvcIds.has(String(s.id)))
        .map((s: any) => {
            // ✅ Nama teknisi dari map atau fallback joined object
            let techName = "Teknisi";
            if (s.dikerjakan_by && technicianNameMap.has(s.dikerjakan_by as string)) {
                techName = technicianNameMap.get(s.dikerjakan_by as string)!;
            } else {
                const joinedName = getJoinedName(s.dikerjakan_by_user);
                if (joinedName) techName = joinedName;
            }

            const nominal = Math.round(Number(s.payment_amount ?? 0));

            const refDate = (s.tanggal_selesai || s.tanggal_diambil || s.tanggal_masuk) as string;
            const tanggal = new Date(refDate).toLocaleDateString("en-CA", {
                timeZone: "Asia/Jakarta",
            });

            // ✅ nama = teknisi, keterangan = customer + payment method service
            return {
                direction: "IN",
                category: "SERVICE",
                nama: techName,
                nominal,
                modal: null,
                keterangan: `Service · ${(s.nama as string) || "—"} · ${(s.payment_method as string) || "—"}`,
                tanggal,
                source_type: "SERVICE",
                source_id: String(s.id),
                is_audited: false,
                // ✅ payment_method selalu null — cashflow_entries hanya terima CASH/SALDO
                // method asli disimpan di keterangan
                payment_method: null,
            };
        })
        .filter((e: any) => e.nominal > 0 && e.tanggal >= CASHFLOW_START_DATE);

    if (newSvcEntries.length > 0) {
        const { error: insertSvcError } = await supabase
            .from("cashflow_entries")
            .insert(newSvcEntries);

        if (insertSvcError) {
            console.error("[cashflow sync] insert service entries error:", insertSvcError.message);
        } else {
            console.log(`[cashflow sync] inserted ${newSvcEntries.length} service entries`);
        }
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

    const { data, error } = await supabase
        .from("cashflow_entries")
        .select(`
            *,
            created_by_user:users!cashflow_entries_created_by_fkey(id, name),
            audited_by_user:users!cashflow_entries_audited_by_fkey(id, name)
        `)
        .order("tanggal", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[cashflow GET]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const rawAll = data ?? [];

    // ── Cek status transaksi asli untuk entry bersumber TRANSACTION ─────────
    // Kalau transaksi sudah di-restore (status ≠ PAID), entry cashflow-nya
    // ditandai voided: tampil abu-abu & tidak bisa diaudit di halaman Cashflow.
    const txSourceIds = Array.from(
        new Set(
            rawAll
                .filter((e: any) => e.source_type === "TRANSACTION" && e.source_id)
                .map((e: any) => e.source_id as string)
        )
    );

    let voidedInvoiceSet = new Set<string>();
    if (txSourceIds.length > 0) {
        const { data: linkedTx } = await supabase
            .from("transactions")
            .select("invoice_number, status")
            .in("invoice_number", txSourceIds);

        voidedInvoiceSet = new Set(
            (linkedTx ?? [])
                .filter((t: any) => t.status !== "PAID")
                .map((t: any) => t.invoice_number as string)
        );
    }

    const all = rawAll.map((e: any) => ({
        ...e,
        is_voided: e.source_type === "TRANSACTION" && voidedInvoiceSet.has(e.source_id),
    }));

    const masuk = all.filter((e: any) => e.direction === "IN");
    const keluar = all.filter((e: any) => e.direction === "OUT");

    const totalMasuk = masuk.reduce((s: number, e: any) => s + Number(e.nominal || 0), 0);
    const totalKeluar = keluar.reduce((s: number, e: any) => s + Number(e.nominal || 0), 0);

    const modalAwalEntry = all.find((e: any) => e.source_type === "MODAL_AWAL") ?? null;

    return NextResponse.json({
        success: true,
        data: { masuk, keluar },
        summary: {
            total_masuk: totalMasuk,
            total_keluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            belum_audit: all.filter((e: any) => !e.is_audited).length,
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

    // ── Special case: Modal Awal ───────────────────────────────────────────────
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

    // ── Regular: Uang Masuk Manual (hanya kategori Biaya Lain-lain) ────────────
    if (direction === "IN") {
        if (!isManualIncomeCategory(category))
            return NextResponse.json(
                { success: false, message: "Uang masuk manual hanya untuk kategori Biaya Lain-lain" },
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

    if (direction !== "OUT")
        return NextResponse.json(
            { success: false, message: "Direction tidak valid" },
            { status: 400 }
        );

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