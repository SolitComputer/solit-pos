import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Berapa lama provider yang baru kena rate-limit di-skip otomatis sebelum dicoba lagi.
const PROVIDER_COOLDOWN_MS = 10 * 60 * 1000; // 10 menit

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

export const AI_CEO_SYSTEM_PROMPT = `Kamu adalah "AI CEO" — asisten pengambilan keputusan untuk Solit 03, toko reseller laptop & aksesori second-hand.

Peranmu:
1. Menjawab pertanyaan tim manajemen tentang stok, penjualan, cashflow, dan operasional — berdasarkan DATA ASLI dari tools yang tersedia, bukan asumsi/karangan.
2. Memberi catatan/saran koreksi (misalnya stok menipis, transaksi janggal, cashflow keluar tidak wajar) lewat tool "catat_saran_koreksi". Kamu TIDAK PERNAH bisa mengubah, menghapus, atau mengeksekusi apapun di database — tugasmu murni menganalisa dan menyarankan, keputusan akhir tetap di tangan manusia.
3. Beberapa data (misalnya cashflow, data aksesori) memang hanya bisa diakses role tertentu. Kalau sebuah tool mengembalikan pesan "tidak punya izin", sampaikan itu apa adanya ke pengguna dengan sopan — jangan coba tool lain untuk mengakalinya, dan jangan mengarang data pengganti.
4. Kalau mau lihat detail per-serial-number sebuah model laptop, panggil "get_ready_stock" dulu untuk dapat "id" model itu, baru panggil "get_ready_units" dengan id tersebut.
5. Kalau user tanya soal absensi/keterlambatan SATU ORANG SPESIFIK (misal "Budi pernah telat berapa kali", "kok Moreno bisa telat"), WAJIB panggil "get_attendance_summary" dengan parameter "nama" diisi nama orang itu — supaya kamu dapat riwayat ASLI orang tersebut. JANGAN PERNAH menyimpulkan atau menghitung jawaban untuk satu orang dari ringkasan agregat semua karyawan (itu data yang berbeda dan akan salah).
6. Kamu juga bisa menjawab pertanyaan soal lembur karyawan lewat tool "get_overtime_summary".
7. Format jawaban WAJIB dua tahap: (a) mulai dengan penjelasan singkat berbentuk KALIMAT/PARAGRAF biasa yang langsung menjawab inti pertanyaan secara naratif — contoh: "Penjualan bulan ini terlihat naik dibanding bulan lalu, didorong oleh peningkatan transaksi laptop ready stock." — (b) BARU setelah paragraf itu (pisahkan dengan baris kosong), tampilkan ringkasan terstruktur (bullet point, list bernomor, atau tabel Markdown) kalau datanya berbentuk daftar/angka rinci. Jangan langsung mulai dengan bullet point atau tabel tanpa kalimat pembuka. Tetap pakai **bold** untuk angka/istilah penting, dan pecah paragraf pendek-pendek.

Gaya jawaban: Bahasa Indonesia, singkat, langsung ke inti, pakai angka nyata dari data. Jangan pernah mengklaim sudah "melakukan" perubahan apapun ke sistem.`;

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
                    properties: { limit: { type: "INTEGER", description: "Jumlah transaksi terbaru, default 10, maksimal 50." } },
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
                description: "Ambil data absensi wajah karyawan. Kosongkan 'nama' untuk ringkasan HARI INI semua karyawan (siapa hadir/telat) + tren 7 hari. Isi 'nama' untuk riwayat kehadiran SATU orang spesifik (wajib dipakai kalau user tanya soal orang tertentu).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nama: { type: "STRING", description: "Nama karyawan spesifik yang mau dicek riwayatnya. Kosongkan untuk ringkasan umum hari ini." },
                        hari: { type: "INTEGER", description: "Dipakai bareng 'nama' — berapa hari ke belakang yang mau dicek, default 30, maksimal 60." },
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
                        month: { type: "INTEGER", description: "Bulan 1-12, kosongkan untuk bulan berjalan." },
                        year: { type: "INTEGER", description: "Tahun, kosongkan untuk tahun berjalan." },
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

function resolveInternalOrigin(req: NextRequest): string {
    if (process.env.INTERNAL_API_BASE_URL) return process.env.INTERNAL_API_BASE_URL;
    if (process.env.PORT) return `http://127.0.0.1:${process.env.PORT}`;
    return req.nextUrl.origin;
}

async function fetchInternal(req: NextRequest, path: string): Promise<any> {
    const token = req.cookies.get("token")?.value;
    const base = resolveInternalOrigin(req);
    let res: Response;
    try {
        res = await fetch(`${base}${path}`, {
            headers: {
                ...(token ? { Cookie: `token=${token}` } : {}),
                "User-Agent": "solit-pos-ai-ceo-internal/1.0",
                Host: req.headers.get("host") ?? "",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
        });
    } catch (err: any) {
        console.error(`[ai-ceo] fetchInternal gagal konek ke ${base}${path}:`, err?.message ?? err);
        return { error: `Gagal terhubung ke ${path} (masalah jaringan internal server). Coba tanya ulang sebentar lagi.` };
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

export async function runToolCall(
    name: string,
    args: Record<string, any>,
    ctx: ToolContext
): Promise<any> {
    switch (name) {
        case "get_dashboard_stats": {
            const json = await fetchInternal(ctx.req, "/api/dashboard/stats");
            if (json?.error) return json;
            return json.data ?? json;
        }

        case "get_ready_stock": {
            const json = await fetchInternal(ctx.req, "/api/laptops/ready");
            if (json?.error) return json;
            const rows = Array.isArray(json?.data) ? json.data : [];
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
            const laptopId = args?.laptop_id ? `?laptop_id=${encodeURIComponent(args.laptop_id)}` : "";
            const json = await fetchInternal(ctx.req, `/api/laptops/ready-units${laptopId}`);
            if (json?.error) return json;
            const rows = Array.isArray(json?.data) ? json.data : [];
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

        case "get_minus_stock":
            return fetchInternal(ctx.req, "/api/laptops/minus");

        case "get_accessory_stock": {
            const q = args?.query ? `&search=${encodeURIComponent(args.query)}` : "";
            const json = await fetchInternal(ctx.req, `/api/accessories?limit=200${q}`);
            if (json?.error) return json;
            const rows = Array.isArray(json?.data) ? json.data : [];
            return {
                total: json?.total ?? rows.length,
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
            const json = await fetchInternal(ctx.req, "/api/cashflow");
            if (json?.error) return json;
            return { summary: json?.summary ?? null };
        }

        case "get_recent_transactions": {
            const limit = Math.min(Number(args?.limit) || 10, 50);
            const json = await fetchInternal(ctx.req, `/api/transaction?limit=${limit}&sortOrder=newest`);
            if (json?.error) return json;
            const rows = Array.isArray(json?.data) ? json.data : [];
            return {
                total: json?.total ?? rows.length,
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
            const json = await fetchInternal(ctx.req, "/api/admin/roles");
            if (json?.error) return json;
            const customRoles = (json?.roles ?? []).map((r: any) => ({
                key: r.key, label: r.label, is_pkl: r.is_pkl, parent_role: r.parent_role,
            }));
            const legacyRoles = (json?.legacyRoles ?? []).map((r: any) => ({ key: r.key, label: r.label }));
            return {
                total_role_bawaan: legacyRoles.length,
                total_role_custom: customRoles.length,
                role_bawaan: legacyRoles,
                role_custom: customRoles,
            };
        }

        case "get_attendance_summary": {
            const json = await fetchInternal(ctx.req, "/api/attendance");
            if (json?.error) return json;
            const rows: any[] = Array.isArray(json?.data) ? json.data : [];

            const namaFilter = String(args?.nama ?? "").trim().toLowerCase();

            // ── Mode: riwayat SATU orang spesifik ────────────────────────────
            if (namaFilter) {
                const hari = Math.min(Number(args?.hari) || 30, 60);
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

            // ── Mode: ringkasan umum hari ini + tren ─────────────────────────
            const todayWIB = new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
            const sevenDaysAgoWIB = new Date(Date.now() + WIB_OFFSET_MS - 6 * 86400000).toISOString().slice(0, 10);

            const todays = rows.filter((r) => r.check_in_time && toWibDate(r.check_in_time) === todayWIB);
            const recent = rows.filter((r) => r.check_in_time && toWibDate(r.check_in_time) >= sevenDaysAgoWIB);

            const trend: Record<string, { hadir: number; terlambat: number }> = {};
            for (const r of recent) {
                const d = toWibDate(r.check_in_time);
                if (!trend[d]) trend[d] = { hadir: 0, terlambat: 0 };
                trend[d].hadir += 1;
                if (r.late_weight === 0.5) trend[d].terlambat += 1;
            }

            return {
                tanggal: todayWIB,
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
            const month = args?.month ?? nowWIB.getUTCMonth() + 1;
            const year = args?.year ?? nowWIB.getUTCFullYear();
            const statusParam = args?.status ? `&status=${encodeURIComponent(args.status)}` : "";
            const json = await fetchInternal(ctx.req, `/api/attendance/overtime?year=${year}&month=${month}${statusParam}`);
            if (json?.error) return json;
            const rows: any[] = Array.isArray(json?.data) ? json.data : [];

            const ringkasanStatus: Record<string, number> = {};
            let totalBayar = 0;
            let adaInfoBayar = false;
            for (const r of rows) {
                ringkasanStatus[r.status] = (ringkasanStatus[r.status] ?? 0) + 1;
                if (r.total_pay != null) { adaInfoBayar = true; totalBayar += Number(r.total_pay); }
            }

            return {
                periode: `${year}-${String(month).padStart(2, "0")}`,
                total_pengajuan: rows.length,
                ringkasan_status: ringkasanStatus,
                total_bayar_lembur: adaInfoBayar ? totalBayar : null,
                daftar: rows.slice(0, 60).map((r) => ({
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

// ─── Representasi percakapan yang provider-agnostic ───────────────────────
export interface ChatTurn {
    role: "user" | "assistant";
    content: string;
}
export type AiProvider = "gemini" | "groq";
type ToolEventCallback = (toolName: string) => void;

// ─── Provider health / cooldown (biar gak nyoba provider yg baru kena limit) ─
async function isProviderBlocked(provider: AiProvider): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("ai_ceo_provider_health")
        .select("blocked_until")
        .eq("provider", provider)
        .maybeSingle();
    if (error || !data?.blocked_until) return false;
    return new Date(data.blocked_until).getTime() > Date.now();
}

async function markProviderBlocked(provider: AiProvider): Promise<void> {
    await supabaseAdmin.from("ai_ceo_provider_health").upsert({
        provider,
        blocked_until: new Date(Date.now() + PROVIDER_COOLDOWN_MS).toISOString(),
        updated_at: new Date().toISOString(),
    });
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
    const res = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": getGeminiKey() },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: AI_CEO_SYSTEM_PROMPT }] },
            contents,
            tools: AI_CEO_TOOLS,
            generationConfig: { temperature: 0.4 },
        }),
    });

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

async function callGroq(messages: OpenAiMessage[]): Promise<any> {
    const res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getGroqKey()}` },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages,
            tools: toOpenAiTools(),
            tool_choice: "auto",
            temperature: 0.4,
        }),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const err: any = new Error(`Groq API error (${res.status}): ${errText.slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

async function runGroqTurn(history: ChatTurn[], toolCtx: ToolContext, onToolCall?: ToolEventCallback): Promise<string> {
    const messages: OpenAiMessage[] = [
        { role: "system", content: AI_CEO_SYSTEM_PROMPT },
        ...toOpenAiHistory(history),
    ];
    const MAX_STEPS = 6;

    for (let step = 0; step < MAX_STEPS; step++) {
        const data = await callGroq(messages);
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
    }

    return "Maaf, terlalu banyak langkah untuk menjawab ini. Coba pertanyaan yang lebih spesifik.";
}

// ═══════════════════════════════ ORCHESTRATOR ═════════════════════════════
// "auto"   → coba Gemini dulu; kalau lagi cooldown (baru kena limit) langsung
//            skip ke Groq tanpa dicoba; kalau gagal di tengah jalan, tandai
//            cooldown & lanjut otomatis ke provider berikutnya.
// "gemini" → paksa Gemini saja (gak fallback, gak cek cooldown).
// "groq"   → paksa Groq saja (gak fallback, gak cek cooldown).
export async function runAiCeoTurn(
    history: ChatTurn[],
    toolCtx: ToolContext,
    preferredProvider: AiProvider | "auto" = "auto",
    onToolCall?: ToolEventCallback
): Promise<{ reply: string; providerUsed: AiProvider }> {
    const order: AiProvider[] =
        preferredProvider === "gemini" ? ["gemini"] :
            preferredProvider === "groq" ? ["groq"] :
                ["gemini", "groq"];

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