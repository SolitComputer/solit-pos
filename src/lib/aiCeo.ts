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
5. Format jawaban pakai Markdown biar gampang dibaca: **bold** untuk angka/istilah penting, bullet point (-) atau list bernomor untuk daftar, dan pecah paragraf pendek-pendek (jangan satu paragraf panjang menggumpal). Kalau ada data berbentuk daftar (stok/transaksi), pakai tabel Markdown.

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

async function fetchInternal(req: NextRequest, path: string): Promise<any> {
  const token = req.cookies.get("token")?.value;
  const res = await fetch(`${req.nextUrl.origin}${path}`, {
    headers: token ? { Cookie: `token=${token}` } : {},
    cache: "no-store",
  });

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
// (dipakai chat/route.ts — gak perlu tau format internal Gemini/Groq sama sekali)
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
export type AiProvider = "gemini" | "groq";

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

async function runGeminiTurn(history: ChatTurn[], toolCtx: ToolContext): Promise<string> {
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

    // Simpan `parts` persis seperti dibalikin Gemini (termasuk thoughtSignature) —
    // Gemini 3.x butuh signature itu balik utuh di request berikutnya.
    contents.push({ role: "model", parts });

    const responseParts: GeminiPart[] = [];
    for (const fc of functionCallParts) {
      const { name, args } = fc.functionCall;
      const result = await runToolCall(name, args ?? {}, toolCtx);
      responseParts.push({ functionResponse: { name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return "Maaf, terlalu banyak langkah untuk menjawab ini. Coba pertanyaan yang lebih spesifik.";
}

// ═══════════════════════════════════ GROQ ═════════════════════════════════
// Groq pakai endpoint OpenAI-compatible, jadi format tool/schema-nya beda dari
// Gemini (lowercase "object"/"string", bukan "OBJECT"/"STRING"). Kita convert
// otomatis dari AI_CEO_TOOLS supaya definisi tool cuma ditulis sekali.

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

async function runGroqTurn(history: ChatTurn[], toolCtx: ToolContext): Promise<string> {
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
      const result = await runToolCall(tc.function.name, args, toolCtx);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return "Maaf, terlalu banyak langkah untuk menjawab ini. Coba pertanyaan yang lebih spesifik.";
}

// ═══════════════════════════════ ORCHESTRATOR ═════════════════════════════
// "auto"   → coba Gemini dulu, kalau gagal/limit otomatis lompat ke Groq.
// "gemini" → paksa Gemini saja (gak fallback).
// "groq"   → paksa Groq saja (gak fallback).
export async function runAiCeoTurn(
  history: ChatTurn[],
  toolCtx: ToolContext,
  preferredProvider: AiProvider | "auto" = "auto"
): Promise<{ reply: string; providerUsed: AiProvider }> {
  const order: AiProvider[] =
    preferredProvider === "gemini" ? ["gemini"] :
    preferredProvider === "groq" ? ["groq"] :
    ["gemini", "groq"];

  let lastError: any = null;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    try {
      const reply =
        provider === "gemini"
          ? await runGeminiTurn(history, toolCtx)
          : await runGroqTurn(history, toolCtx);
      return { reply, providerUsed: provider };
    } catch (err: any) {
      lastError = err;
      const isLast = i === order.length - 1;
      if (isLast) throw err;
      // masih ada provider berikutnya di antrian → lanjut otomatis, apapun sebab errornya
    }
  }
  throw lastError ?? new Error("Semua provider AI gagal dipanggil.");
}