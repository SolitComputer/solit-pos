import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CASHFLOW_CUTOFF_ISO, isValidCategory, isModalAwalActive } from "@/lib/cashflow"; // ← tambah isModalAwalActive

function getAdmin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

async function syncDerivedEntries(supabase: SupabaseClient) {
    // ... (tidak berubah, tetap sama persis)
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

    const masuk = (data ?? []).filter((e: any) => e.direction === "IN");
    const keluar = (data ?? []).filter((e: any) => e.direction === "OUT");
    const totalMasuk = masuk.reduce((s: number, e: any) => s + Number(e.nominal || 0), 0);
    const totalKeluar = keluar.reduce((s: number, e: any) => s + Number(e.nominal || 0), 0);

    // ✅ BARU: cari entry modal awal untuk dikirim ke frontend
    const modalAwalEntry = (data ?? []).find((e: any) => e.source_type === "MODAL_AWAL") ?? null;

    return NextResponse.json({
        success: true,
        data: { masuk, keluar },
        summary: {
            total_masuk: totalMasuk,
            total_keluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            belum_audit: (data ?? []).filter((e: any) => !e.is_audited).length,
            modal_awal_entry: modalAwalEntry, // ✅ BARU
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

    // Validasi nominal berlaku untuk semua case
    const nom = Math.round(Number(nominal));
    if (!Number.isFinite(nom) || nom <= 0)
        return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });

    const supabase = getAdmin();
    const userName = (user?.name && String(user.name).trim()) || "—";
    const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    // ── ✅ BARU: Special case Modal Awal (IN) ─────────────────────────────────
    if (direction === "IN" && category === "MODAL_AWAL") {
        // Cek deadline 3 hari (server-side, tidak bisa dibypass dari client)
        if (!isModalAwalActive())
            return NextResponse.json(
                { success: false, message: "Periode input modal awal sudah berakhir (aktif 07–09 Jul 2026)" },
                { status: 400 }
            );

        // Cek apakah sudah pernah diisi (hanya boleh 1x)
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
                nama: userName,                                        // nama akun yang mengisi
                nominal: nom,
                modal: null,
                keterangan: keterangan?.trim() || "Modal awal cashflow",
                tanggal: tanggal || jakartaToday,
                source_type: "MODAL_AWAL",                            // sumber khusus, tidak bisa dihapus
                source_id: null,
                created_by: user.id,                                   // ✅ akun tercatat
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

    // ── Regular: Uang Keluar Manual (OUT) ─────────────────────────────────────
    if (direction !== "OUT")
        return NextResponse.json(
            { success: false, message: "Hanya uang keluar yang bisa diinput manual" },
            { status: 400 }
        );

    if (!isValidCategory(direction, category))
        return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });

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