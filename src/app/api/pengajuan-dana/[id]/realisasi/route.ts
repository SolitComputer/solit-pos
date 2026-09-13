import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FUND_EXECUTOR_IDS } from "@/lib/fundConfig";
import { isValidCategory } from "@/lib/cashflow";

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// ── POST: isi realisasi pengeluaran untuk pengajuan yang sudah dieksekusi.
// Otomatis insert ke cashflow_entries (Uang Keluar) supaya tersinkron, dan
// men-link balik fund_requests-nya lewat realisasi_cashflow_id. ──────────────
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const userId = request.headers.get("x-user-id");
    const userName = decodeURIComponent(request.headers.get("x-user-name") || "") || "—";
    const roles = (request.headers.get("x-user-roles") || "").split(",").filter(Boolean);

    if (!userId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!FUND_EXECUTOR_IDS.includes(userId) && !roles.includes("ADMIN")) {
        return NextResponse.json(
            { success: false, message: "Anda tidak memiliki wewenang untuk mengisi realisasi" },
            { status: 403 }
        );
    }

    let body: {
        category?: string;
        nominal?: number | string;
        keterangan?: string;
        tanggal?: string;
        payment_method?: string;
        photo_url?: string | null;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    const { category, nominal, keterangan, tanggal, payment_method, photo_url } = body;

    const nom = Math.round(Number(nominal));
    if (!Number.isFinite(nom) || nom <= 0) {
        return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });
    }
    if (!category || !isValidCategory("OUT", category)) {
        return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });
    }
    const pm = payment_method === "SALDO" ? "SALDO" : "CASH";

    const supabase = db();

    // Cek dulu: harus sudah dieksekusi & belum pernah direalisasi sebelumnya
    const { data: fundRequest, error: fetchErr } = await supabase
        .from("fund_requests")
        .select("id, purpose, is_executed, realisasi_cashflow_id, executed_by_id, executed_by_name")
        .eq("id", id)
        .single();

    if (fetchErr || !fundRequest) {
        return NextResponse.json({ success: false, message: "Pengajuan tidak ditemukan" }, { status: 404 });
    }
    if (!fundRequest.is_executed) {
        return NextResponse.json(
            { success: false, message: "Pengajuan harus dieksekusi dulu sebelum diisi realisasinya" },
            { status: 400 }
        );
    }
    if (fundRequest.realisasi_cashflow_id) {
        return NextResponse.json(
            { success: false, message: "Pengajuan ini sudah pernah diisi realisasinya" },
            { status: 400 }
        );
    }

    // ⬅️ BARU: cuma orang yang SAMA yang mengeksekusi pengajuan ini yang boleh
    // mengisi realisasinya (bukan sembarang executor) — Admin tetap boleh override.
    if (!roles.includes("ADMIN") && fundRequest.executed_by_id !== userId) {
        return NextResponse.json(
            { success: false, message: `Hanya ${fundRequest.executed_by_name ?? "eksekutor"} yang bisa mengisi realisasi pengajuan ini` },
            { status: 403 }
        );
    }

    const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    // 1. Insert entry Uang Keluar ke Cashflow — inilah yang bikin otomatis sinkron
    const { data: cashflowEntry, error: cfError } = await supabase
        .from("cashflow_entries")
        .insert({
            direction: "OUT",
            category,
            nama: userName,
            nominal: nom,
            modal: null,
            keterangan: keterangan?.trim() || fundRequest.purpose || null,
            tanggal: tanggal || jakartaToday,
            source_type: "PENGAJUAN_DANA",
            source_id: id,
            payment_method: pm,
            photo_url: photo_url ?? null,
            created_by: userId,
            is_audited: false,
        })
        .select()
        .single();

    if (cfError) {
        console.error("[pengajuan-dana realisasi] insert cashflow error:", cfError);
        return NextResponse.json({ success: false, message: cfError.message }, { status: 500 });
    }

    // 2. Tandai pengajuan sudah direalisasi + simpan link ke entry Cashflow-nya
    const { data: updated, error: updateErr } = await supabase
        .from("fund_requests")
        .update({
            realisasi_cashflow_id: cashflowEntry.id,
            realisasi_nominal: nom,
            realisasi_by_id: userId,
            realisasi_by_name: userName,
            realisasi_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

    if (updateErr) {
        // Entry Cashflow-nya sudah kebuat & benar (bagian terpenting), tapi gagal
        // link balik ke fund_requests — log biar ketahuan, tetap balikin sukses.
        console.error("[pengajuan-dana realisasi] gagal update fund_requests:", updateErr);
        return NextResponse.json({
            success: true,
            data: { ...fundRequest, realisasi_cashflow_id: cashflowEntry.id },
            warning: "Tersimpan di Cashflow, tapi status Pengajuan Dana gagal ter-update. Refresh halaman.",
        });
    }

    return NextResponse.json({ success: true, data: updated }, { status: 201 });
}

// ── PUT: edit realisasi pengeluaran untuk pengajuan yang sudah direalisasi ─────
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const userId = request.headers.get("x-user-id");
    const roles = (request.headers.get("x-user-roles") || "").split(",").filter(Boolean);

    if (!userId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!FUND_EXECUTOR_IDS.includes(userId) && !roles.includes("ADMIN")) {
        return NextResponse.json(
            { success: false, message: "Anda tidak memiliki wewenang untuk mengedit realisasi" },
            { status: 403 }
        );
    }

    let body: {
        category?: string;
        nominal?: number | string;
        keterangan?: string;
        tanggal?: string;
        payment_method?: string;
        photo_url?: string | null;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    const { category, nominal, keterangan, tanggal, payment_method, photo_url } = body;

    const nom = Math.round(Number(nominal));
    if (!Number.isFinite(nom) || nom <= 0) {
        return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });
    }
    if (!category || !isValidCategory("OUT", category)) {
        return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });
    }
    const pm = payment_method === "SALDO" ? "SALDO" : "CASH";

    const supabase = db();

    const { data: fundRequest, error: fetchErr } = await supabase
        .from("fund_requests")
        .select("id, purpose, is_executed, realisasi_cashflow_id, executed_by_id, realisasi_by_id")
        .eq("id", id)
        .single();

    if (fetchErr || !fundRequest) {
        return NextResponse.json({ success: false, message: "Pengajuan tidak ditemukan" }, { status: 404 });
    }
    if (!fundRequest.realisasi_cashflow_id) {
        return NextResponse.json(
            { success: false, message: "Pengajuan ini belum diisi realisasinya" },
            { status: 400 }
        );
    }

    if (!roles.includes("ADMIN") && fundRequest.realisasi_by_id !== userId && fundRequest.executed_by_id !== userId) {
        return NextResponse.json(
            { success: false, message: "Hanya yang mengisi realisasi atau Admin yang bisa mengubah data realisasi ini" },
            { status: 403 }
        );
    }

    // Cek apakah entry cashflow terkait sudah diaudit
    const { data: cfEntry } = await supabase
        .from("cashflow_entries")
        .select("id, is_audited")
        .eq("id", fundRequest.realisasi_cashflow_id)
        .single();

    if (cfEntry?.is_audited) {
        return NextResponse.json(
            { success: false, message: "Entry cashflow sudah diaudit dan tidak bisa diubah. Batalkan status audit terlebih dahulu." },
            { status: 400 }
        );
    }

    const jakartaToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

    const cfUpdatePayload: any = {
        category,
        nominal: nom,
        keterangan: keterangan?.trim() || fundRequest.purpose || null,
        tanggal: tanggal || jakartaToday,
        payment_method: pm,
    };
    if (photo_url !== undefined) {
        cfUpdatePayload.photo_url = photo_url;
    }

    const { error: cfUpdateErr } = await supabase
        .from("cashflow_entries")
        .update(cfUpdatePayload)
        .eq("id", fundRequest.realisasi_cashflow_id);

    if (cfUpdateErr) {
        console.error("[pengajuan-dana realisasi PUT] update cashflow error:", cfUpdateErr);
        return NextResponse.json({ success: false, message: cfUpdateErr.message }, { status: 500 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("fund_requests")
        .update({
            realisasi_nominal: nom,
        })
        .eq("id", id)
        .select()
        .single();

    if (updateErr) {
        return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
}