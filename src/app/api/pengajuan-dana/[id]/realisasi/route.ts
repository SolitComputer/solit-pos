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
        items?: { category: string; nominal: number | string }[]; // ⬅️ BARU: multi-kategori
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    const { keterangan, tanggal, payment_method, photo_url } = body;

    // ⬅️ BARU: dukung multi-kategori (items[]) — tombol "+" di modal Realisasi
    // bisa nambah berapa pun baris Kategori+Nominal. Tetap backward-compatible:
    // kalau client lama masih kirim body lama (category/nominal tunggal tanpa
    // items), otomatis dibungkus jadi array isi 1 item.
    type RealisasiItem = { category: string; nominal: number };

    const rawItems: { category?: string; nominal?: number | string }[] =
        Array.isArray(body.items) && body.items.length > 0
            ? body.items
            : [{ category: body.category, nominal: body.nominal }];

    // Gabungkan kategori kembar (jumlahkan nominalnya) supaya tidak melanggar
    // unique index uniq_cashflow_source (source_type, source_id, category).
    const merged = new Map<string, number>();
    for (const it of rawItems) {
        const nom = Math.round(Number(it.nominal));
        if (!Number.isFinite(nom) || nom <= 0) {
            return NextResponse.json({ success: false, message: "Nominal tidak valid" }, { status: 400 });
        }
        if (!it.category || !isValidCategory("OUT", it.category)) {
            return NextResponse.json({ success: false, message: "Kategori tidak valid" }, { status: 400 });
        }
        merged.set(it.category, (merged.get(it.category) ?? 0) + nom);
    }

    const items: RealisasiItem[] = Array.from(merged, ([category, nominal]) => ({ category, nominal }));
    const totalNominal = items.reduce((sum, it) => sum + it.nominal, 0);
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

    // 1. Insert entry Uang Keluar ke Cashflow — inilah yang bikin otomatis sinkron.
    // Insert SEKALIGUS semua items (1 baris cashflow_entries per kategori),
    // semua pakai source_id yang sama (id pengajuan ini) supaya tetap ke-grup.
    const { data: cashflowEntries, error: cfError } = await supabase
        .from("cashflow_entries")
        .insert(
            items.map((it) => ({
                direction: "OUT",
                category: it.category,
                nama: userName,
                nominal: it.nominal,
                modal: null,
                keterangan: keterangan?.trim() || fundRequest.purpose || null,
                tanggal: tanggal || jakartaToday,
                source_type: "PENGAJUAN_DANA",
                source_id: id,
                payment_method: pm,
                photo_url: photo_url ?? null,
                created_by: userId,
                is_audited: false,
            }))
        )
        .select();

    if (cfError || !cashflowEntries || cashflowEntries.length === 0) {
        console.error("[pengajuan-dana realisasi] insert cashflow error:", cfError);
        return NextResponse.json(
            { success: false, message: cfError?.message ?? "Gagal menyimpan realisasi" },
            { status: 500 }
        );
    }

    // realisasi_cashflow_id tetap nunjuk ke SATU entry (yang pertama) — sesuai
    // keputusan: gak nambah kolom baru, total tetap kebaca dari realisasi_nominal,
    // detail per-kategori tetap bisa dicek lewat cashflow_entries where source_id = id ini.
    const primaryEntry = cashflowEntries[0];

    // 2. Tandai pengajuan sudah direalisasi + simpan link ke entry Cashflow PERTAMA.
    //    .is("realisasi_cashflow_id", null) = kunci anti-dobel: kalau request lain
    //    sudah lebih dulu menautkan realisasi, update ini tidak mengenai baris apa pun.
    const { data: updated, error: updateErr } = await supabase
        .from("fund_requests")
        .update({
            realisasi_cashflow_id: primaryEntry.id,
            realisasi_nominal: totalNominal,
            realisasi_by_id: userId,
            realisasi_by_name: userName,
            realisasi_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("realisasi_cashflow_id", null)
        .select()
        .maybeSingle();

    if (updateErr) {
        // Entry Cashflow-nya sudah kebuat & benar (bagian terpenting), tapi gagal
        // link balik ke fund_requests — log biar ketahuan, tetap balikin sukses.
        console.error("[pengajuan-dana realisasi] gagal update fund_requests:", updateErr);
        return NextResponse.json({
            success: true,
            data: { ...fundRequest, realisasi_cashflow_id: primaryEntry.id },
            warning: "Tersimpan di Cashflow, tapi status Pengajuan Dana gagal ter-update. Refresh halaman.",
        });
    }

    if (!updated) {
        // Kalah balapan (double submit): request lain sudah lebih dulu menautkan
        // realisasi → buang SEMUA entry cashflow yang barusan kita buat sendiri.
        await supabase
            .from("cashflow_entries")
            .delete()
            .in("id", cashflowEntries.map((e: { id: string }) => e.id));
        return NextResponse.json(
            { success: false, message: "Pengajuan ini sudah pernah diisi realisasinya" },
            { status: 400 }
        );
    }

    return NextResponse.json({ success: true, data: updated }, { status: 201 });
}

// ── PUT: edit realisasi — SENGAJA DINONAKTIFKAN ───────────────────────────────
// Realisasi bersifat FINAL: begitu sebuah pengajuan sudah diisi realisasinya
// (realisasi_cashflow_id terisi), tidak ada cara mengubahnya lagi lewat method
// ini, berapa pun rolenya (termasuk ADMIN) dan meskipun entry cashflow-nya
// belum diaudit. Sama seperti pola "unexecute" yang diblokir total di
// src/app/api/pengajuan-dana/[id]/route.ts.
export async function PUT() {
    return NextResponse.json(
        { success: false, message: "Realisasi tidak bisa diedit setelah diinput" },
        { status: 400 }
    );
}