import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ALL_STATIC_ROLES, humanizeRoleKey, CASHFLOW_ROLES } from "@/lib/permissions";
import { fetchAllRows } from "@/lib/supabaseFetch";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

const PROVIDER_COOLDOWN_MS = 10 * 60 * 1000;

function getGeminiKey(): string {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY belum diset di environment variables.");
    return key;
}

function getGroqKey(): string {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY belum diset di environment variables.");
    return key;
}

function getDeepSeekKey(): string {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error("DEEPSEEK_API_KEY belum diset di environment variables.");
    return key;
}

function buildAiCeoSystemPrompt(): string {
    const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const todayLabel = `${dayNames[nowWIB.getUTCDay()]}, ${nowWIB.toISOString().slice(0, 10)} (WIB)`;

    return `Kamu adalah "AI CEO" — asisten pengambilan keputusan untuk Solit 03, toko reseller laptop & aksesori second-hand.

Konteks waktu: HARI INI adalah ${todayLabel}. Kalau user pakai istilah relatif ("kemarin", "besok", "minggu ini", "bulan lalu"), HITUNG SENDIRI tanggal/bulan/tahun konkretnya dari hari ini, lalu kirim sebagai tanggal pasti ke parameter tool (contoh: kirim "2026-07-26", bukan teks "kemarin"). Semua parameter angka pada tool (limit, hari, month, year) WAJIB dikirim sebagai angka murni dalam bentuk teks (contoh "30", "7", "2026") — jangan sertakan kata lain di dalamnya.

Peranmu:
1. Menjawab pertanyaan tim manajemen tentang stok, penjualan, cashflow, dan operasional — berdasarkan DATA ASLI dari tools yang tersedia, bukan asumsi/karangan.
2. Memberi catatan/saran koreksi (misalnya stok menipis, transaksi janggal, cashflow keluar tidak wajar) lewat tool "catat_saran_koreksi". Kamu TIDAK PERNAH bisa mengubah, menghapus, atau mengeksekusi apapun di database — tugasmu murni menganalisa dan menyarankan, keputusan akhir tetap di tangan manusia.
3. Beberapa data (misalnya cashflow, data aksesori) memang hanya bisa diakses role tertentu. Kalau sebuah tool mengembalikan pesan "tidak punya izin", sampaikan itu apa adanya ke pengguna dengan sopan — jangan coba tool lain untuk mengakalinya, dan jangan mengarang data pengganti.
4. Kalau mau lihat detail per-serial-number sebuah model laptop, panggil "get_ready_stock" dulu untuk dapat "id" model itu, baru panggil "get_ready_units" dengan id tersebut.
5. Kalau user tanya soal absensi/keterlambatan SATU ORANG SPESIFIK (misal "Budi pernah telat berapa kali", "kok Moreno bisa telat"), WAJIB panggil "get_attendance_summary" dengan parameter "nama" diisi nama orang itu — supaya kamu dapat riwayat ASLI orang tersebut. JANGAN PERNAH menyimpulkan atau menghitung jawaban untuk satu orang dari ringkasan agregat semua karyawan (itu data yang berbeda dan akan salah).
6. Kalau user tanya soal absensi umum di TANGGAL TERTENTU (misal "cek absensi kemarin", "siapa yang absen tanggal 20"), panggil "get_attendance_summary" TANPA parameter "nama", isi parameter "tanggal" dengan tanggal konkret (YYYY-MM-DD) hasil hitunganmu dari konteks waktu di atas.
7. Kamu juga bisa menjawab pertanyaan soal lembur karyawan lewat tool "get_overtime_summary".
8. Format jawaban WAJIB dua tahap: (a) mulai dengan penjelasan singkat berbentuk KALIMAT/PARAGRAF biasa yang langsung menjawab inti pertanyaan secara naratif — contoh: "Penjualan bulan ini terlihat naik dibanding bulan lalu, didorong oleh peningkatan transaksi laptop ready stock." — (b) BARU setelah paragraf itu (pisahkan dengan baris kosong), tampilkan ringkasan terstruktur (bullet point, list bernomor, atau tabel Markdown) kalau datanya berbentuk daftar/angka rinci. Jangan langsung mulai dengan bullet point atau tabel tanpa kalimat pembuka. Tetap pakai **bold** untuk angka/istilah penting, dan pecah paragraf pendek-pendek.

Gaya jawaban: Bahasa Indonesia, singkat, langsung ke inti, pakai angka nyata dari data. Jangan pernah mengklaim sudah "melakukan" perubahan apapun ke sistem.`;
}

export const AI_CEO_TOOLS = [
    {
        functionDeclarations: [
            {
                name: "get_dashboard_stats",
                description: "Ambil ringkasan statistik dashboard utama hari ini: omzet, profit, jumlah transaksi, laptop terjual, total stok, tren 7 hari, top sales, top sumber, top laptop terlaris.",
                parameters: { type: "OBJECT", properties: {}, required: [] },
            },
            {
                name: "get_ready_stock",
                description: "Ambil daftar model laptop yang statusnya siap jual (ready) beserta qty per model. Bisa difilter kata kunci nama/brand/cpu.",
                parameters: {
                    type: "OBJECT",
                    properties: { query: { type: "STRING", description: "Kata kunci nama/brand/cpu, kosongkan untuk semua." } },
                    required: [],
                },
            },
            {
                name: "get_ready_units",
                description: "Ambil detail per-serial-number (unit) untuk satu model laptop tertentu — statusnya bisa SIAP_JUAL, RESERVED, HELD, atau PACKING. Butuh laptop_id dari hasil get_ready_stock.",
                parameters: {
                    type: "OBJECT",
                    properties: { laptop_id: { type: "STRING", description: "ID model laptop, didapat dari field 'id' hasil get_ready_stock." } },
                    required: [],
                },
            },
            {
                name: "get_minus_stock",
                description: "Ambil daftar laptop dengan stok minus/bermasalah yang perlu perhatian.",
                parameters: { type: "OBJECT", properties: {}, required: [] },
            },
            {
                name: "get_accessory_stock",
                description: "Ambil daftar stok aksesori beserta harga & jumlah. Bisa difilter kata kunci nama/brand/spec.",
                parameters: {
                    type: "OBJECT",
                    properties: { query: { type: "STRING", description: "Kata kunci nama/brand/spec aksesori, kosongkan untuk semua." } },
                    required: [],
                },
            },
            {
                name: "get_cashflow_summary",
                description: "Ambil ringkasan total uang masuk, uang keluar, saldo, dan jumlah entry yang belum diaudit. Hanya bisa diakses role ADMIN/PROGRAMMER/ACCOUNTING/PURCHASING.",
                parameters: { type: "OBJECT", properties: {}, required: [] },
            },
            {
                name: "get_recent_transactions",
                description: "Ambil daftar transaksi terbaru (invoice, customer, laptop, harga deal, status, sales, tanggal).",
                parameters: {
                    type: "OBJECT",
                    properties: { limit: { type: "STRING", description: "Jumlah transaksi terbaru sebagai angka (contoh '10'), default 10, maksimal 50." } },
                    required: [],
                },
            },
            {
                name: "get_daftar_role",
                description: "Ambil daftar semua role/jabatan di sistem — role bawaan sistem maupun role custom yang dibuat admin. Hanya bisa diakses ADMIN/PROGRAMMER/ASISTEN_CEO.",
                parameters: { type: "OBJECT", properties: {}, required: [] },
            },
            {
                name: "get_attendance_summary",
                description: "Ambil data absensi wajah karyawan. Kosongkan 'nama' untuk ringkasan SATU TANGGAL (default hari ini, bisa diganti lewat 'tanggal') semua karyawan (siapa hadir/telat) + tren 7 hari sebelumnya. Isi 'nama' untuk riwayat kehadiran SATU orang spesifik dalam N hari terakhir (wajib dipakai kalau user tanya soal orang tertentu).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nama: { type: "STRING", description: "Nama karyawan spesifik yang mau dicek riwayatnya. Kosongkan untuk mode ringkasan umum per tanggal." },
                        hari: { type: "STRING", description: "Dipakai BARENG 'nama' — berapa hari ke belakang yang mau dicek, sebagai angka (contoh '30'), default 30, maksimal 60." },
                        tanggal: { type: "STRING", description: "Dipakai TANPA 'nama' — tanggal spesifik untuk ringkasan umum, format YYYY-MM-DD (hitung sendiri dari 'hari ini' kalau user bilang 'kemarin'/'besok'/dll). Kosongkan untuk hari ini." },
                    },
                    required: [],
                },
            },
            {
                name: "get_overtime_summary",
                description: "Ambil ringkasan pengajuan/riwayat lembur karyawan pada bulan tertentu — jumlah per status, total bayar (kalau kamu berwenang lihat), dan daftar ringkasnya.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        month: { type: "STRING", description: "Bulan sebagai angka 1-12 (contoh '7'), kosongkan untuk bulan berjalan." },
                        year: { type: "STRING", description: "Tahun sebagai angka (contoh '2026'), kosongkan untuk tahun berjalan." },
                        status: { type: "STRING", description: "Filter status dipisah koma, misal 'PENDING,ONGOING'. Kosongkan untuk semua status." },
                    },
                    required: [],
                },
            },
            {
                name: "catat_saran_koreksi",
                description: "Catat satu saran/koreksi ke daftar review manajemen (tidak mengubah data operasional apapun).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        category: { type: "STRING", description: "stok, keuangan, operasional, atau lainnya." },
                        title: { type: "STRING", description: "Judul singkat." },
                        description: { type: "STRING", description: "Penjelasan lengkap." },
                        severity: { type: "STRING", description: "info, warning, atau critical." },
                    },
                    required: ["category", "title", "description"],
                },
            },
        ],
    },
];

interface ToolContext {
    req: NextRequest;
    userId: string;
    conversationId: string | null;
}

function resolveInternalOriginCandidates(req: NextRequest): string[] {
    const candidates: string[] = [];
    if (process.env.INTERNAL_API_BASE_URL) candidates.push(process.env.INTERNAL_API_BASE_URL);
    if (process.env.PORT) candidates.push(`http://127.0.0.1:${process.env.PORT}`);

    const fwdHost = req.headers.get("x-forwarded-host");
    const fwdProto = req.headers.get("x-forwarded-proto") ?? "https";
    if (fwdHost) candidates.push(`${fwdProto}://${fwdHost}`);

    candidates.push(req.nextUrl.origin);

    return Array.from(new Set(candidates)).filter((c) => {
        try {
            return new URL(c).hostname !== "0.0.0.0";
        } catch {
            return false;
        }
    });
}

async function fetchInternal(req: NextRequest, path: string): Promise<any> {
    const token = req.cookies.get("token")?.value;
    const candidates = resolveInternalOriginCandidates(req);
    const originalHost = req.headers.get("host") ?? "";

    let res: Response | null = null;
    let lastErr: any = null;

    for (const base of candidates) {
        const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(base);
        try {
            res = await fetch(`${base}${path}`, {
                headers: {
                    ...(token ? { Cookie: `token=${token}` } : {}),
                    "User-Agent": "solit-pos-ai-ceo-internal/1.0",
                    ...(isLoopback ? { Host: originalHost } : {}),
                },
                cache: "no-store",
                signal: AbortSignal.timeout(15000),
            });
            lastErr = null;
            break;
        } catch (err: any) {
            lastErr = err;
            console.error(`[ai-ceo] fetchInternal gagal konek ke ${base}${path}:`, err?.message ?? err, "| cause:", err?.cause ?? "(tidak ada info cause)");
        }
    }

    if (!res) {
        return { error: `Gagal terhubung ke ${path} setelah mencoba semua rute jaringan internal (${candidates.length} percobaan). Coba tanya ulang sebentar lagi. Detail: ${lastErr?.cause ?? lastErr?.message ?? lastErr}` };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        return { error: `Data dari ${path} tidak bisa diakses (kemungkinan tidak punya izin).` };
    }

    const json = await res.json().catch(() => null);
    if (!json) return { error: `Respons tidak valid dari ${path}.` };

    if (res.status === 401 || res.status === 403) {
        return { error: "Akun kamu tidak punya izin untuk melihat data ini." };
    }
    if (json.success === false) {
        return { error: json.message || `Gagal mengambil data dari ${path}.` };
    }
    return json;
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const toWibDate = (iso: string) => new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
const toWibTime = (iso: string) => new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(11, 19) + " WIB";

function toIntSafe(value: any, fallback: number, max?: number): number {
    const parsed = typeof value === "number" ? value : parseInt(String(value ?? "").replace(/[^0-9-]/g, ""), 10);
    const result = Number.isFinite(parsed) ? parsed : fallback;
    return max !== undefined ? Math.min(result, max) : result;
}

// Baca role efektif user dari header yang sudah divalidasi & disuntik middleware
// (x-user-roles / x-user-role) — supaya tool yang datanya sensitif (mis. cashflow)
// tetap kena gate permission yang sama walau sekarang query langsung ke Supabase
// (bukan lewat fetch ke route yang dibungkus withAuth).
function getUserRolesFromRequest(req: NextRequest): string[] {
    const raw = req.headers.get("x-user-roles") || req.headers.get("x-user-role") || "";
    return raw.split(",").map((r) => r.trim()).filter(Boolean);
}

// ── Statistik dashboard, di-port dari /api/dashboard/stats supaya AI CEO tidak
// bergantung pada self-fetch HTTP (yang gagal di hosting berbasis Passenger/socket
// seperti Hostinger — lihat catatan di resolveInternalOriginCandidates di atas).
function dashGetTodayWIB(): string {
    return new Date(Date.now() + WIB_OFFSET_MS).toISOString().split("T")[0];
}
function dashGetYesterdayWIB(): string {
    const d = new Date(Date.now() + WIB_OFFSET_MS);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split("T")[0];
}
function dashGetLast7DaysWIB(): string {
    const d = new Date(Date.now() + WIB_OFFSET_MS);
    d.setUTCDate(d.getUTCDate() - 6);
    return d.toISOString().split("T")[0];
}
function dashDealPrice(item: any): number {
    return Number(item.deal_price || item.amount || 0);
}
function dashCountUnitsSold(item: any): number {
    if (Array.isArray(item.unit_ids) && item.unit_ids.length > 0) return item.unit_ids.length;
    if (item.unit_id) return 1;
    return Number(item.qty || item.quantity || 1);
}
function dashMargin(item: any, unitMap: Map<string, number>): number {
    const dealPrice = dashDealPrice(item);
    let totalPurchasePrice = 0;
    if (Array.isArray(item.unit_ids) && item.unit_ids.length > 0) {
        for (const uid of item.unit_ids) totalPurchasePrice += unitMap.get(uid) ?? 0;
    } else if (item.unit_id) {
        totalPurchasePrice = unitMap.get(item.unit_id) ?? 0;
    }
    return totalPurchasePrice > 0 ? dealPrice - totalPurchasePrice : 0;
}
function dashWibDateToUTCRange(dateWIB: string): { start: string; end: string } {
    const [y, m, d] = dateWIB.split("-").map(Number);
    const startWIB = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - WIB_OFFSET_MS);
    const endWIB = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - WIB_OFFSET_MS);
    return { start: startWIB.toISOString(), end: endWIB.toISOString() };
}

async function computeDashboardStatsDirect(): Promise<any> {
    const today = dashGetTodayWIB();
    const yesterday = dashGetYesterdayWIB();
    const weekStart = dashGetLast7DaysWIB();

    const todayRange = dashWibDateToUTCRange(today);
    const yesterdayRange = dashWibDateToUTCRange(yesterday);
    const weekStartRange = dashWibDateToUTCRange(weekStart);
    const weekEndRange = dashWibDateToUTCRange(today);

    const [todayTransactions, laptops, weeklyTransactions, yesterdayTransactions] = await Promise.all([
        fetchAllRows<any>((f, t) => supabaseAdmin.from("transactions").select("*").eq("status", "PAID")
            .gte("paid_at", todayRange.start).lt("paid_at", todayRange.end).range(f, t)),
        fetchAllRows<any>((f, t) => supabaseAdmin.from("laptops").select("*").eq("status", "SIAP_JUAL").gt("qty", 0).range(f, t)),
        fetchAllRows<any>((f, t) => supabaseAdmin.from("transactions").select("*").eq("status", "PAID")
            .gte("paid_at", weekStartRange.start).lt("paid_at", weekEndRange.end).range(f, t)),
        fetchAllRows<any>((f, t) => supabaseAdmin.from("transactions").select("*").eq("status", "PAID")
            .gte("paid_at", yesterdayRange.start).lt("paid_at", yesterdayRange.end).range(f, t)),
    ]);

    const allTransactions = [...(todayTransactions ?? []), ...(weeklyTransactions ?? []), ...(yesterdayTransactions ?? [])];
    const allUnitIds = new Set<string>();
    for (const trx of allTransactions) {
        if (trx.unit_id) allUnitIds.add(trx.unit_id);
        if (Array.isArray(trx.unit_ids)) for (const uid of trx.unit_ids) { if (uid) allUnitIds.add(uid); }
    }

    const unitMap = new Map<string, number>();
    if (allUnitIds.size > 0) {
        const { data: units } = await supabaseAdmin.from("laptop_units").select("id, purchase_price").in("id", Array.from(allUnitIds));
        for (const unit of units ?? []) unitMap.set(unit.id, Number(unit.purchase_price ?? 0));
    }

    const todayRevenue = todayTransactions?.reduce((acc, item) => acc + dashDealPrice(item), 0) || 0;
    const todayGrossProfit = todayTransactions?.reduce((acc, item) => acc + dashMargin(item, unitMap), 0) || 0;
    const yesterdayRevenue = yesterdayTransactions?.reduce((acc, item) => acc + dashDealPrice(item), 0) || 0;
    const yesterdayGrossProfit = yesterdayTransactions?.reduce((acc, item) => acc + dashMargin(item, unitMap), 0) || 0;
    const yesterdayTrxCount = yesterdayTransactions?.length || 0;

    const revenueChange = yesterdayRevenue > 0 ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : null;
    const profitChange = yesterdayGrossProfit > 0 ? Math.round(((todayGrossProfit - yesterdayGrossProfit) / yesterdayGrossProfit) * 100) : null;
    const trxChange = yesterdayTrxCount > 0 ? Math.round((((todayTransactions?.length || 0) - yesterdayTrxCount) / yesterdayTrxCount) * 100) : null;

    const stockTotal = laptops?.reduce((acc, item) => acc + (item.qty || 0), 0) || 0;

    const trendMap: Record<string, { revenue: number; profit: number; trxCount: number; laptopSold: number }> = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() + WIB_OFFSET_MS);
        d.setUTCDate(d.getUTCDate() - i);
        trendMap[d.toISOString().split("T")[0]] = { revenue: 0, profit: 0, trxCount: 0, laptopSold: 0 };
    }
    weeklyTransactions?.forEach((item) => {
        if (!item.paid_at) return;
        const dateKey = new Date(new Date(item.paid_at).getTime() + WIB_OFFSET_MS).toISOString().split("T")[0];
        if (trendMap[dateKey]) {
            trendMap[dateKey].revenue += dashDealPrice(item);
            trendMap[dateKey].profit += dashMargin(item, unitMap);
            trendMap[dateKey].trxCount += 1;
            trendMap[dateKey].laptopSold += dashCountUnitsSold(item);
        }
    });
    const weeklyTrend = Object.entries(trendMap).map(([date, data]) => {
        const [y, m, d] = date.split("-").map(Number);
        const label = new Date(y, m - 1, d).toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
        return { date, label, ...data };
    });

    const salesMap: Record<string, { total: number; profit: number }> = {};
    todayTransactions?.forEach((item) => {
        const sales = item.sales_name || "Unknown";
        if (!salesMap[sales]) salesMap[sales] = { total: 0, profit: 0 };
        salesMap[sales].total += 1;
        salesMap[sales].profit += dashMargin(item, unitMap);
    });
    const topSales = Object.entries(salesMap).map(([name, data]) => ({ name, total: data.total, profit: data.profit }))
        .sort((a, b) => b.total - a.total).slice(0, 5);

    const sourceMap: Record<string, number> = {};
    weeklyTransactions?.forEach((item) => {
        const source = item.source_platform || "Unknown";
        sourceMap[source] = (sourceMap[source] || 0) + 1;
    });
    const topSources = Object.entries(sourceMap).map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total).slice(0, 6);

    const laptopMap: Record<string, number> = {};
    todayTransactions?.forEach((item) => {
        const laptop = item.laptop_name || "Unknown";
        laptopMap[laptop] = (laptopMap[laptop] || 0) + dashCountUnitsSold(item);
    });
    const topLaptop = Object.entries(laptopMap).map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total).slice(0, 5);

    const todayLaptopSold = todayTransactions?.reduce((acc, item) => acc + dashCountUnitsSold(item), 0) || 0;

    return {
        todayRevenue,
        todayProfit: todayGrossProfit,
        todayTransactions: todayTransactions?.length || 0,
        todayLaptopSold,
        laptopReady: laptops?.length || 0,
        stockTotal,
        revenueChange,
        profitChange,
        trxChange,
        weeklyTrend,
        topSales,
        topSources,
        topLaptop,
    };
}

export async function runToolCall(
    name: string,
    args: Record<string, any>,
    ctx: ToolContext
): Promise<any> {
    switch (name) {
        case "get_dashboard_stats": {
            try {
                return await computeDashboardStatsDirect();
            } catch (err: any) {
                return { error: `Gagal mengambil statistik dashboard: ${err?.message ?? err}` };
            }
        }

        case "get_ready_stock": {
            const { data, error } = await supabaseAdmin
                .from("laptops")
                .select("*")
                .eq("status", "SIAP_JUAL")
                .gt("qty", 0)
                .order("created_at", { ascending: false });
            if (error) return { error: `Gagal mengambil data laptop ready: ${error.message}` };
            const rows = data ?? [];
            const q = String(args?.query ?? "").trim().toLowerCase();
            const filtered = q
                ? rows.filter((r: any) =>
                    [r.laptop_name, r.brand, r.cpu, r.ram, r.storage, r.gpu, r.display]
                        .filter(Boolean)
                        .some((v: any) => String(v).toLowerCase().includes(q))
                )
                : rows;
            return {
                total: filtered.length,
                data: filtered.map((r: any) => ({
                    id: r.id,
                    laptop_name: r.laptop_name,
                    brand: r.brand,
                    cpu: r.cpu,
                    ram: r.ram,
                    storage: r.storage,
                    qty: r.qty,
                    selling_price: r.selling_price,
                })),
            };
        }

        case "get_ready_units": {
            let unitQuery = supabaseAdmin
                .from("laptop_units")
                .select(`*, laptop:laptops (id, laptop_name, brand, cpu, ram, storage, display, selling_price)`)
                .in("status", ["SIAP_JUAL", "RESERVED", "HELD", "PACKING"])
                .order("created_at", { ascending: false });
            if (args?.laptop_id) unitQuery = unitQuery.eq("laptop_id", args.laptop_id);
            const { data, error } = await unitQuery;
            if (error) return { error: `Gagal mengambil detail unit: ${error.message}` };
            const rows = data ?? [];
            const lean = rows.slice(0, 60).map((u: any) => ({
                serial_number: u.serial_number,
                status: u.status,
                laptop_name: u.laptop?.laptop_name,
                brand: u.laptop?.brand,
                cpu: u.laptop?.cpu,
                ram: u.laptop?.ram,
                storage: u.laptop?.storage,
                selling_price: u.laptop?.selling_price,
            }));
            return { total: rows.length, shown: lean.length, data: lean };
        }

        case "get_minus_stock": {
            const { data, error } = await supabaseAdmin
                .from("laptop_units")
                .select(`*, laptop:laptops (id, laptop_name, brand, cpu, ram, storage, selling_price)`)
                .in("status", ["SERVICE", "BELUM_SIAP"])
                .order("created_at", { ascending: false });
            if (error) return { error: `Gagal mengambil data laptop bermasalah: ${error.message}` };
            const rows = data ?? [];
            return {
                total: rows.length,
                data: rows.slice(0, 60).map((u: any) => ({
                    serial_number: u.serial_number,
                    status: u.status,
                    repair_status: u.repair_status,
                    analisa: u.analisa,
                    laptop_name: u.laptop?.laptop_name,
                    brand: u.laptop?.brand,
                    cpu: u.laptop?.cpu,
                })),
            };
        }

        case "get_accessory_stock": {
            let accQuery = supabaseAdmin
                .from("accessories")
                .select("*", { count: "exact" })
                .order("created_at", { ascending: false })
                .limit(200);
            const search = String(args?.query ?? "").trim();
            if (search) accQuery = accQuery.or(`name.ilike.%${search}%,brand.ilike.%${search}%,spec.ilike.%${search}%`);
            const { data, error, count } = await accQuery;
            if (error) return { error: `Gagal mengambil data aksesori: ${error.message}` };
            const rows = data ?? [];
            return {
                total: count ?? rows.length,
                data: rows.map((a: any) => ({
                    name: a.name,
                    category: a.category,
                    brand: a.brand,
                    stock: a.stock,
                    buy_price: a.buy_price,
                    sell_price: a.sell_price,
                })),
            };
        }

        case "get_cashflow_summary": {
            const userRoles = getUserRolesFromRequest(ctx.req);
            const allowed = userRoles.some((r) => (CASHFLOW_ROLES as string[]).includes(r));
            if (!allowed) {
                return { error: "Akun kamu tidak punya izin untuk melihat data cashflow." };
            }

            try {
                const rows = await fetchAllRows<any>((from, to) =>
                    supabaseAdmin
                        .from("cashflow_entries")
                        .select("direction, nominal, is_audited, source_type, source_id")
                        .order("tanggal", { ascending: false })
                        .range(from, to)
                );

                // Entry dari transaksi yang statusnya sudah bukan PAID (dibatalkan) tidak
                // ikut dihitung ke saldo — mirror logic "is_voided" di /api/cashflow.
                const txSourceIds = Array.from(new Set(
                    rows.filter((e) => e.source_type === "TRANSACTION" && e.source_id).map((e) => e.source_id as string)
                ));
                const voidedInvoices = new Set<string>();
                if (txSourceIds.length > 0) {
                    const { data: txRows } = await supabaseAdmin
                        .from("transactions")
                        .select("invoice_number, status")
                        .in("invoice_number", txSourceIds);
                    for (const t of txRows ?? []) {
                        if (t.status !== "PAID") voidedInvoices.add(t.invoice_number);
                    }
                }

                let totalMasuk = 0;
                let totalKeluar = 0;
                let belumAudit = 0;
                for (const e of rows) {
                    const isVoided = e.source_type === "TRANSACTION" && voidedInvoices.has(e.source_id);
                    if (e.direction === "IN") {
                        if (!isVoided) totalMasuk += Number(e.nominal || 0);
                    } else {
                        totalKeluar += Number(e.nominal || 0);
                    }
                    if (!e.is_audited && !isVoided) belumAudit += 1;
                }

                return {
                    summary: {
                        total_masuk: totalMasuk,
                        total_keluar: totalKeluar,
                        saldo: totalMasuk - totalKeluar,
                        belum_audit: belumAudit,
                    },
                };
            } catch (err: any) {
                return { error: `Gagal mengambil data cashflow: ${err?.message ?? err}` };
            }
        }

        case "get_recent_transactions": {
            const limit = toIntSafe(args?.limit, 10, 50);
            const { data, error, count } = await supabaseAdmin
                .from("transactions")
                .select(
                    "invoice_number, status, customer_name, laptop_name, deal_price, amount, sales_name, payment_method, source_platform, created_at, paid_at",
                    { count: "exact" }
                )
                .order("created_at", { ascending: false })
                .limit(limit);
            if (error) return { error: `Gagal mengambil data transaksi: ${error.message}` };
            const rows = data ?? [];
            return {
                total: count ?? rows.length,
                data: rows.map((t: any) => ({
                    invoice_number: t.invoice_number,
                    status: t.status,
                    customer_name: t.customer_name,
                    laptop_name: t.laptop_name,
                    deal_price: t.deal_price ?? t.amount,
                    sales_name: t.sales_name,
                    payment_method: t.payment_method,
                    source_platform: t.source_platform,
                    created_at: t.created_at,
                    paid_at: t.paid_at,
                })),
            };
        }

        case "get_daftar_role": {
            const { data, error } = await supabaseAdmin
                .from("dynamic_roles")
                .select("id,key,label,icon,badge_bg,badge_text,badge_border,is_pkl,parent_role,created_at")
                .order("label");
            if (error) return { error: `Gagal mengambil daftar role: ${error.message}` };
            const legacyOverrides: Record<string, string> = {
                PKL: "PKL (Umum)",
                ASISTEN_CEO: "Asisten CEO",
                CC: "Content Creator",
            };
            const legacyRoles = ALL_STATIC_ROLES
                .map((key) => ({ key, label: legacyOverrides[key] ?? humanizeRoleKey(key) }))
                .sort((a, b) => a.label.localeCompare(b.label));
            const customRoles = (data ?? []).map((r: any) => ({
                key: r.key, label: r.label, is_pkl: r.is_pkl, parent_role: r.parent_role,
            }));
            return {
                total_role_bawaan: legacyRoles.length,
                total_role_custom: customRoles.length,
                role_bawaan: legacyRoles,
                role_custom: customRoles,
            };
        }

        case "get_attendance_summary": {
            const PAGE_SIZE = 1000;
            let allAbsenRows: any[] = [];
            let absenFrom = 0;
            while (true) {
                const { data: pageData, error: pageErr } = await supabaseAdmin
                    .from("face_verifications")
                    .select(`*, users!inner (id, name, role, shift)`)
                    .in("status", ["SUCCESS"])
                    .order("created_at", { ascending: true })
                    .range(absenFrom, absenFrom + PAGE_SIZE - 1);
                if (pageErr) return { error: `Gagal mengambil data absensi: ${pageErr.message}` };
                if (!pageData || pageData.length === 0) break;
                allAbsenRows = allAbsenRows.concat(pageData);
                if (pageData.length < PAGE_SIZE) break;
                absenFrom += PAGE_SIZE;
            }

            const seenAbsen = new Set<string>();
            const rows = allAbsenRows
                .filter((item: any) => {
                    const wibDate = toWibDate(item.created_at);
                    const key = `${item.user_id}_${wibDate}`;
                    if (seenAbsen.has(key)) return false;
                    seenAbsen.add(key);
                    return true;
                })
                .map((item: any) => ({
                    check_in_time: item.created_at,
                    user_name: item.users?.name ?? "Unknown",
                    user_role: item.users?.role ?? "STAFF",
                    late_weight: item.late_weight != null ? Number(item.late_weight) : null,
                }));

            const namaFilter = String(args?.nama ?? "").trim().toLowerCase();

            if (namaFilter) {
                const hari = toIntSafe(args?.hari, 30, 60);
                const cutoffDate = new Date(Date.now() + WIB_OFFSET_MS - (hari - 1) * 86400000).toISOString().slice(0, 10);

                const personRows = rows.filter(
                    (r) => r.check_in_time && r.user_name && String(r.user_name).toLowerCase().includes(namaFilter) && toWibDate(r.check_in_time) >= cutoffDate
                );

                if (personRows.length === 0) {
                    return { error: `Tidak ditemukan data absensi untuk nama mengandung "${args.nama}" dalam ${hari} hari terakhir.` };
                }

                const terlambat = personRows.filter((r) => r.late_weight === 0.5);
                const diLuarJadwal = personRows.filter((r) => r.late_weight === 0);

                return {
                    nama_ditemukan: personRows[0].user_name,
                    role: personRows[0].user_role,
                    periode_hari: hari,
                    total_hadir: personRows.length,
                    total_terlambat: terlambat.length,
                    total_di_luar_jadwal: diLuarJadwal.length,
                    detail_terlambat: terlambat
                        .sort((a, b) => (a.check_in_time < b.check_in_time ? 1 : -1))
                        .map((r) => ({ tanggal: toWibDate(r.check_in_time), jam: toWibTime(r.check_in_time) })),
                };
            }

            // ── Mode: ringkasan umum SATU TANGGAL (default hari ini) + tren ──
            const requestedDate = String(args?.tanggal ?? "").trim();
            const targetDateWIB = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
                ? requestedDate
                : new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
            const sevenDaysAgoWIB = new Date(new Date(`${targetDateWIB}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);

            const todays = rows.filter((r) => r.check_in_time && toWibDate(r.check_in_time) === targetDateWIB);
            const recent = rows.filter(
                (r) => r.check_in_time && toWibDate(r.check_in_time) >= sevenDaysAgoWIB && toWibDate(r.check_in_time) <= targetDateWIB
            );

            const trend: Record<string, { hadir: number; terlambat: number }> = {};
            for (const r of recent) {
                const d = toWibDate(r.check_in_time);
                if (!trend[d]) trend[d] = { hadir: 0, terlambat: 0 };
                trend[d].hadir += 1;
                if (r.late_weight === 0.5) trend[d].terlambat += 1;
            }

            return {
                tanggal: targetDateWIB,
                total_hadir_hari_ini: todays.length,
                total_terlambat_hari_ini: todays.filter((r) => r.late_weight === 0.5).length,
                total_di_luar_jadwal_hari_ini: todays.filter((r) => r.late_weight === 0).length,
                daftar_hadir_hari_ini: todays.slice(0, 60).map((r) => ({
                    nama: r.user_name,
                    role: r.user_role,
                    jam_masuk: toWibTime(r.check_in_time),
                    status_ketepatan: r.late_weight === 1 ? "TEPAT" : r.late_weight === 0.5 ? "TERLAMBAT" : "DI_LUAR_JADWAL",
                })),
                tren_7_hari_terakhir: Object.entries(trend)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([tanggal, v]) => ({ tanggal, ...v })),
            };
        }

        case "get_overtime_summary": {
            const nowWIB = new Date(Date.now() + WIB_OFFSET_MS);
            const month = toIntSafe(args?.month, nowWIB.getUTCMonth() + 1, 12);
            const year = toIntSafe(args?.year, nowWIB.getUTCFullYear());
            const paddedMonth = String(month).padStart(2, "0");
            const startDate = `${year}-${paddedMonth}-01`;
            const lastDay = new Date(Number(year), Number(month), 0).getDate();
            const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;

            let otQuery = supabaseAdmin
                .from("overtime_requests")
                .select("id, user_id, request_date, status, duration_minutes, total_pay, is_late, is_holiday")
                .gte("request_date", startDate)
                .lte("request_date", endDate)
                .order("request_date", { ascending: false });

            if (args?.status) {
                const statusList = String(args.status).split(",").map((s: string) => s.trim()).filter(Boolean);
                otQuery = statusList.length > 1 ? otQuery.in("status", statusList) : otQuery.eq("status", statusList[0]);
            }

            const { data: otRowsRaw, error: otErr } = await otQuery;
            if (otErr) return { error: `Gagal mengambil data lembur: ${otErr.message}` };
            const otRows = otRowsRaw ?? [];

            const otUserIds = Array.from(new Set(otRows.map((r: any) => r.user_id).filter(Boolean)));
            const otUsersMap = new Map<string, { name: string; role: string }>();
            if (otUserIds.length > 0) {
                const { data: otUsersData } = await supabaseAdmin.from("users").select("id, name, role").in("id", otUserIds);
                for (const u of otUsersData ?? []) otUsersMap.set(u.id, { name: u.name, role: u.role });
            }

            const rows = otRows.map((r: any) => ({ ...r, users: otUsersMap.get(r.user_id) ?? null }));

            const ringkasanStatus: Record<string, number> = {};
            let totalBayar = 0;
            let adaInfoBayar = false;
            for (const r of rows) {
                ringkasanStatus[r.status] = (ringkasanStatus[r.status] ?? 0) + 1;
                if (r.total_pay != null) { adaInfoBayar = true; totalBayar += Number(r.total_pay); }
            }

            return {
                periode: `${year}-${paddedMonth}`,
                total_pengajuan: rows.length,
                ringkasan_status: ringkasanStatus,
                total_bayar_lembur: adaInfoBayar ? totalBayar : null,
                daftar: rows.slice(0, 60).map((r: any) => ({
                    nama: r.users?.name,
                    role: r.users?.role,
                    tanggal: r.request_date,
                    status: r.status,
                    durasi_menit: r.duration_minutes,
                    total_pay: r.total_pay ?? null,
                    terlambat: r.is_late,
                    hari_libur: r.is_holiday,
                })),
            };
        }

        case "catat_saran_koreksi": {
            const { error } = await supabaseAdmin.from("ai_ceo_suggestions").insert({
                conversation_id: ctx.conversationId,
                created_by: ctx.userId,
                category: args.category ?? "operasional",
                title: args.title ?? "Catatan AI",
                description: args.description ?? "",
                severity: args.severity ?? "info",
            });
            if (error) return { error: error.message };
            return { success: true, message: "Catatan tersimpan untuk direview manajemen." };
        }

        default:
            return { error: `Tool "${name}" tidak dikenal.` };
    }
}

export interface ChatTurn {
    role: "user" | "assistant";
    content: string;
}

export type AiProvider = "gemini" | "groq" | "deepseek";
type ToolEventCallback = (toolName: string) => void;

async function isProviderBlocked(provider: AiProvider): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("ai_ceo_provider_health")
        .select("blocked_until")
        .eq("provider", provider)
        .maybeSingle();
    if (error) {
        console.error("[ai-ceo] isProviderBlocked gagal query (tabel ai_ceo_provider_health belum dibuat?):", error.message);
        return false;
    }
    if (!data?.blocked_until) return false;
    return new Date(data.blocked_until).getTime() > Date.now();
}

async function markProviderBlocked(provider: AiProvider): Promise<void> {
    const { error } = await supabaseAdmin.from("ai_ceo_provider_health").upsert({
        provider,
        blocked_until: new Date(Date.now() + PROVIDER_COOLDOWN_MS).toISOString(),
        updated_at: new Date().toISOString(),
    });
    if (error) {
        console.error("[ai-ceo] markProviderBlocked gagal upsert (tabel ai_ceo_provider_health belum dibuat?):", error.message);
    }
}

function isRateLimitError(err: any): boolean {
    const status = err?.status;
    const msg = String(err?.message ?? "");
    return status === 429 || /rate.?limit|quota|RESOURCE_EXHAUSTED/i.test(msg);
}

// ═══════════════════════════════════ GEMINI ═══════════════════════════════

type GeminiPart =
    | { text: string; thoughtSignature?: string }
    | { functionCall: { name: string; args: Record<string, any> }; thoughtSignature?: string }
    | { functionResponse: { name: string; response: any } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function toGeminiHistory(history: ChatTurn[]): GeminiContent[] {
    return history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
    }));
}

async function callGemini(contents: GeminiContent[]): Promise<any> {
    let res: Response;
    try {
        res = await fetch(GEMINI_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": getGeminiKey() },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: buildAiCeoSystemPrompt() }] },
                contents,
                tools: AI_CEO_TOOLS,
                generationConfig: { temperature: 0.4 },
            }),
        });
    } catch (err: any) {
        console.error("[ai-ceo] callGemini gagal konek ke Gemini API:", err?.message ?? err, "| cause:", err?.cause ?? "(tidak ada info cause)");
        const netErr: any = new Error("NETWORK_ERROR: Gagal terhubung ke server Gemini.");
        netErr.isNetworkError = true;
        throw netErr;
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const err: any = new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

async function runGeminiTurn(history: ChatTurn[], toolCtx: ToolContext, onToolCall?: ToolEventCallback): Promise<string> {
    const contents: GeminiContent[] = toGeminiHistory(history);
    const MAX_STEPS = 6;

    for (let step = 0; step < MAX_STEPS; step++) {
        const data = await callGemini(contents);
        const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];

        const functionCallParts = parts.filter(
            (p): p is { functionCall: { name: string; args: Record<string, any> }; thoughtSignature?: string } =>
                "functionCall" in p
        );

        if (functionCallParts.length === 0) {
            const textPart = parts.find((p): p is { text: string } => "text" in p);
            return textPart?.text?.trim() || "Maaf, saya belum bisa memproses pertanyaan itu.";
        }

        contents.push({ role: "model", parts });

        const responseParts: GeminiPart[] = [];
        for (const fc of functionCallParts) {
            const { name, args } = fc.functionCall;
            onToolCall?.(name);
            const result = await runToolCall(name, args ?? {}, toolCtx);
            responseParts.push({ functionResponse: { name, response: result } });
        }
        contents.push({ role: "user", parts: responseParts });
    }

    return "Maaf, terlalu banyak langkah untuk menjawab ini. Coba pertanyaan yang lebih spesifik.";
}

// ═══════════════════════════════════ GROQ ═════════════════════════════════

function lowerCaseSchemaTypes(schema: any): any {
    if (!schema || typeof schema !== "object") return schema;
    const out: any = { ...schema };
    if (typeof out.type === "string") out.type = out.type.toLowerCase();
    if (out.properties) {
        out.properties = Object.fromEntries(
            Object.entries(out.properties).map(([k, v]) => [k, lowerCaseSchemaTypes(v)])
        );
    }
    return out;
}

function toOpenAiTools() {
    return AI_CEO_TOOLS[0].functionDeclarations.map((fn) => ({
        type: "function",
        function: {
            name: fn.name,
            description: fn.description,
            parameters: lowerCaseSchemaTypes(fn.parameters),
        },
    }));
}

type OpenAiMessage =
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "assistant"; content: null; tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
    | { role: "tool"; tool_call_id: string; content: string };

function toOpenAiHistory(history: ChatTurn[]): OpenAiMessage[] {
    return history.map((h) => ({ role: h.role, content: h.content }));
}

async function callGroq(messages: OpenAiMessage[], toolsEnabled: boolean = true): Promise<any> {
    let res: Response;
    try {
        res = await fetch(GROQ_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getGroqKey()}` },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                ...(toolsEnabled ? { tools: toOpenAiTools(), tool_choice: "auto" } : {}),
                temperature: 0.4,
            }),
        });
    } catch (err: any) {
        console.error("[ai-ceo] callGroq gagal konek ke Groq API:", err?.message ?? err, "| cause:", err?.cause ?? "(tidak ada info cause)");
        const netErr: any = new Error("NETWORK_ERROR: Gagal terhubung ke server Groq.");
        netErr.isNetworkError = true;
        throw netErr;
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const err: any = new Error(`Groq API error (${res.status}): ${errText.slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

function isMalformedToolCallError(err: any): boolean {
    return /tool_use_failed|tool call validation failed|not in request\.tools/i.test(String(err?.message ?? ""));
}

async function runGroqTurn(history: ChatTurn[], toolCtx: ToolContext, onToolCall?: ToolEventCallback): Promise<string> {
    const messages: OpenAiMessage[] = [
        { role: "system", content: buildAiCeoSystemPrompt() },
        ...toOpenAiHistory(history),
    ];
    const MAX_STEPS = 6;
    let hasToolData = false;

    for (let step = 0; step < MAX_STEPS; step++) {
        let data: any;
        try {
            data = await callGroq(messages);
        } catch (err: any) {
            // Bug spesifik Llama/Groq: model kadang menggabungkan nama tool + argumen
            // jadi satu string rusak saat sebenarnya cuma mau menjawab teks biasa.
            // Kalau ini terjadi SETELAH minimal 1 tool call berhasil (data sudah ada),
            // paksa satu panggilan lagi TANPA tools supaya model menulis jawaban akhir
            // dari data yang sudah dikumpulkan — daripada langsung gagal total.
            if (isMalformedToolCallError(err) && hasToolData) {
                console.error("[ai-ceo] Groq tool call rusak, retry tanpa tools:", err?.message ?? err);
                const recovery = await callGroq(messages, false);
                const recoveryMsg = recovery?.choices?.[0]?.message;
                return (recoveryMsg?.content ?? "").trim() || "Maaf, saya belum bisa memproses pertanyaan itu.";
            }
            throw err;
        }

        const message = data?.choices?.[0]?.message;
        const toolCalls = message?.tool_calls ?? [];

        if (toolCalls.length === 0) {
            return (message?.content ?? "").trim() || "Maaf, saya belum bisa memproses pertanyaan itu.";
        }

        messages.push({ role: "assistant", content: null, tool_calls: toolCalls });

        for (const tc of toolCalls) {
            let args: Record<string, any> = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch { }
            onToolCall?.(tc.function.name);
            const result = await runToolCall(tc.function.name, args, toolCtx);
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        hasToolData = true;
    }

    return "Maaf, terlalu banyak langkah untuk menjawab ini. Coba pertanyaan yang lebih spesifik.";
}

// ═══════════════════════════════════ DEEPSEEK ══════════════════════════════
// Wire format-nya sama persis kayak Groq (OpenAI-compatible), jadi tinggal
// reuse toOpenAiTools/toOpenAiHistory/OpenAiMessage/isMalformedToolCallError
// yang sudah ada, cuma beda endpoint/API key/model.

async function callDeepSeek(messages: OpenAiMessage[], toolsEnabled: boolean = true): Promise<any> {
    let res: Response;
    try {
        res = await fetch(DEEPSEEK_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${getDeepSeekKey()}` },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages,
                ...(toolsEnabled ? { tools: toOpenAiTools(), tool_choice: "auto" } : {}),
                temperature: 0.4,
            }),
        });
    } catch (err: any) {
        console.error("[ai-ceo] callDeepSeek gagal konek ke DeepSeek API:", err?.message ?? err, "| cause:", err?.cause ?? "(tidak ada info cause)");
        const netErr: any = new Error("NETWORK_ERROR: Gagal terhubung ke server DeepSeek.");
        netErr.isNetworkError = true;
        throw netErr;
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const err: any = new Error(`DeepSeek API error (${res.status}): ${errText.slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

async function runDeepSeekTurn(history: ChatTurn[], toolCtx: ToolContext, onToolCall?: ToolEventCallback): Promise<string> {
    const messages: OpenAiMessage[] = [
        { role: "system", content: buildAiCeoSystemPrompt() },
        ...toOpenAiHistory(history),
    ];
    const MAX_STEPS = 6;
    let hasToolData = false;

    for (let step = 0; step < MAX_STEPS; step++) {
        let data: any;
        try {
            data = await callDeepSeek(messages);
        } catch (err: any) {
            if (isMalformedToolCallError(err) && hasToolData) {
                console.error("[ai-ceo] DeepSeek tool call rusak, retry tanpa tools:", err?.message ?? err);
                const recovery = await callDeepSeek(messages, false);
                const recoveryMsg = recovery?.choices?.[0]?.message;
                return (recoveryMsg?.content ?? "").trim() || "Maaf, saya belum bisa memproses pertanyaan itu.";
            }
            throw err;
        }

        const message = data?.choices?.[0]?.message;
        const toolCalls = message?.tool_calls ?? [];

        if (toolCalls.length === 0) {
            return (message?.content ?? "").trim() || "Maaf, saya belum bisa memproses pertanyaan itu.";
        }

        messages.push({ role: "assistant", content: null, tool_calls: toolCalls });

        for (const tc of toolCalls) {
            let args: Record<string, any> = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch { }
            onToolCall?.(tc.function.name);
            const result = await runToolCall(tc.function.name, args, toolCtx);
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        hasToolData = true;
    }

    return "Maaf, terlalu banyak langkah untuk menjawab ini. Coba pertanyaan yang lebih spesifik.";
}

export async function runAiCeoTurn(
    history: ChatTurn[],
    toolCtx: ToolContext,
    preferredProvider: AiProvider | "auto" = "auto",
    onToolCall?: ToolEventCallback
): Promise<{ reply: string; providerUsed: AiProvider }> {
    const order: AiProvider[] =
        preferredProvider === "gemini" ? ["gemini"] :
            preferredProvider === "groq" ? ["groq"] :
                preferredProvider === "deepseek" ? ["deepseek"] :
                    ["deepseek", "gemini", "groq"];

    let lastError: any = null;
    for (let i = 0; i < order.length; i++) {
        const provider = order[i];
        const isLast = i === order.length - 1;

        if (preferredProvider === "auto" && !isLast) {
            const blocked = await isProviderBlocked(provider);
            if (blocked) continue;
        }

        try {
            const reply =
                provider === "gemini"
                    ? await runGeminiTurn(history, toolCtx, onToolCall)
                    : provider === "deepseek"
                        ? await runDeepSeekTurn(history, toolCtx, onToolCall)
                        : await runGroqTurn(history, toolCtx, onToolCall);
            return { reply, providerUsed: provider };
        } catch (err: any) {
            lastError = err;
            if (isRateLimitError(err)) {
                markProviderBlocked(provider).catch(() => { });
            }
            if (isLast) throw err;
        }
    }
    throw lastError ?? new Error("Semua provider AI gagal dipanggil.");
}

export function classifyAiCeoError(err: any): "missing_key" | "quota" | "network" | "tool_glitch" | "unknown" {
    const msg = String(err?.message ?? "");
    if (/belum diset di environment variables/i.test(msg)) return "missing_key";
    if (err?.isNetworkError) return "network";
    if (err?.status === 429 || /rate.?limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) return "quota";
    if (isMalformedToolCallError(err)) return "tool_glitch";
    return "unknown";
}