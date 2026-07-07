import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CASHFLOW_CUTOFF_ISO, isValidCategory } from "@/lib/cashflow";

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// ── Sync uang masuk otomatis dari transaksi & service (mulai 06/07/2026) ──────
// ── Sync uang masuk otomatis dari transaksi & service (mulai 06/07/2026) ──────
async function syncDerivedEntries(supabase: SupabaseClient) {
    // 1) Penjualan laptop → transaksi PAID
    const { data: trx } = await supabase
        .from("transactions")
        .select("invoice_number, customer_name, sales_name, deal_price, amount, created_at")
        .eq("status", "PAID")
        .gte("created_at", CASHFLOW_CUTOFF_ISO);

    const trxRows = (trx ?? [])
        .map((t: any) => ({
            direction: "IN",
            category: "PENJUALAN_LAPTOP",
            // ✅ FIXED: Prioritas sales_name, fallback ke "—" bukan customer_name
            // customer_name tidak dipakai supaya kolom Nama = Sales, bukan Customer
            nama: (t.sales_name && String(t.sales_name).trim()) || "—",
            nominal: Math.round(Number(t.deal_price ?? t.amount ?? 0)),
            keterangan: `Invoice ${t.invoice_number} · ${t.customer_name || ""}`.trim().replace(/·\s*$/, ""),
            source_type: "TRANSACTION",
            source_id: t.invoice_number,
            tanggal: (t.created_at ?? "").slice(0, 10) || null,
            is_audited: false,
        }))
        .filter((r) => r.nominal > 0 && r.source_id && r.tanggal);

    // 2) Service → payment_amount > 0
    const { data: svc } = await supabase
        .from("service_orders")
        .select("id, nama, teknisi, payment_amount, payment_confirmed_at, payment_method")
        .gt("payment_amount", 0)
        .gte("payment_confirmed_at", CASHFLOW_CUTOFF_ISO);

    const svcRows = (svc ?? [])
        .map((s: any) => ({
            direction: "IN",
            category: "SERVICE",
            // ✅ teknisi = staff yang handle, nama = customer service (untuk info)
            nama: (s.teknisi && String(s.teknisi).trim()) || "—",
            nominal: Math.round(Number(s.payment_amount ?? 0)),
            // ✅ Taruh nama customer di keterangan supaya tetap terlacak
            keterangan: `Servis · ${s.payment_method || "CASH"} · ${s.nama || ""}`.trim().replace(/·\s*$/, ""),
            source_type: "SERVICE",
            source_id: s.id,
            tanggal: (s.payment_confirmed_at ?? "").slice(0, 10) || null,
            is_audited: false,
        }))
        .filter((r) => r.nominal > 0 && r.source_id && r.tanggal);

    const all = [...trxRows, ...svcRows];
    if (all.length > 0) {
        // ✅ FIXED: ignoreDuplicates: false → nama sales ter-update kalau ada perubahan
        // is_audited TIDAK ikut di-update karena kita tidak include field itu di rows
        // Supabase upsert hanya update field yang ada di object → is_audited aman
        await supabase
            .from("cashflow_entries")
            .upsert(all, { onConflict: "source_type,source_id", ignoreDuplicates: false });
    }
}

// ── GET /api/cashflow ─────────────────────────────────────────────────────────
export const GET = withAuth(async () => {
    const supabase = getAdmin();

    try {
        await syncDerivedEntries(supabase);
    } catch (e) {
        console.error("[cashflow sync]", e); // sync gagal jangan blok tampilan data
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

    const masuk = (data ?? []).filter((e: any) => e.direction === "IN");
    const keluar = (data ?? []).filter((e: any) => e.direction === "OUT");
    const totalMasuk = masuk.reduce((s: number, e: any) => s + Number(e.nominal || 0), 0);
    const totalKeluar = keluar.reduce((s: number, e: any) => s + Number(e.nominal || 0), 0);

    return NextResponse.json({
        success: true,
        data: { masuk, keluar },
        summary: {
            total_masuk: totalMasuk,
            total_keluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            belum_audit: (data ?? []).filter((e: any) => !e.is_audited).length,
        },
    });
}, CASHFLOW_ROLES);

// ── POST /api/cashflow — input manual (uang keluar / uang masuk non-otomatis) ──
export const POST = withAuth(async (req, _ctx, user: any) => {
    const body = await req.json();
    const { direction, category, nominal, keterangan, tanggal } = body as {
        direction: string;
        category: string;
        nominal: number | string;
        keterangan?: string;
        tanggal?: string;
    };

    if (direction !== "OUT")
        return NextResponse.json(
            { success: false, message: "Hanya uang keluar yang bisa diinput manual" },
            { status: 400 }
        );

    if (!isValidCategory(direction, category))
        return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });

    const nom = Math.round(Number(nominal));
    if (!Number.isFinite(nom) || nom <= 0)
        return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });

    // ✅ Nama = nama user yg mengisi formulir (bukan input manual lagi)
    const userName = (user?.name && String(user.name).trim()) || "—";

    const supabase = getAdmin();
    const { data, error } = await supabase
        .from("cashflow_entries")
        .insert({
            direction,
            category,
            nama: userName,
            nominal: nom,
            modal: null, // harga modal dihapus dari input
            keterangan: keterangan?.trim() || null,
            tanggal: tanggal || new Date().toISOString().slice(0, 10),
            source_type: "MANUAL",
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