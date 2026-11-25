import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isRateLimited } from "@/lib/rateLimit";

// ── POST /api/partners/register ─────────────────────────────────────────────
// Public endpoint (no auth) — dipanggil dari form di solit03.com.
// CORS whitelist: solit03.com saja.

const ALLOWED_ORIGINS = [
  "https://solit.id",
  "https://www.solit.id",
  "http://localhost:5173", // dev Vite
  "http://localhost:3000", // dev Next
];

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // ── Rate limit: 5 submit per IP per 10 menit ──────────────────────────────
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`partner-register:${ip}`, 5, 600_000)) {
    return NextResponse.json(
      { success: false, message: "Terlalu banyak percobaan, coba lagi nanti" },
      { status: 429, headers }
    );
  }

  try {
    const body = await request.json();

    // ── Validasi field (sama persis dengan Google Forms) ─────────────────────
    const { type, full_name, phone, email, full_address, referred_by } = body;

    if (!type || !["MITRA", "RESELLER"].includes(type)) {
      return NextResponse.json(
        { success: false, message: "Tipe pendaftaran harus MITRA atau RESELLER" },
        { status: 400, headers }
      );
    }
    if (!full_name?.trim()) {
      return NextResponse.json(
        { success: false, message: "Nama lengkap wajib diisi" },
        { status: 400, headers }
      );
    }
    if (!phone?.trim()) {
      return NextResponse.json(
        { success: false, message: "No HP wajib diisi" },
        { status: 400, headers }
      );
    }
    if (!email?.trim()) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi" },
        { status: 400, headers }
      );
    }
    // Validasi format email sederhana
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { success: false, message: "Format email tidak valid" },
        { status: 400, headers }
      );
    }
    if (!full_address?.trim()) {
      return NextResponse.json(
        { success: false, message: "Alamat lengkap wajib diisi" },
        { status: 400, headers }
      );
    }

    // ── Sanitasi & trim ─────────────────────────────────────────────────────
    const sanitized = {
      type: type.trim().toUpperCase(),
      full_name: full_name.trim(),
      phone: phone.trim().replace(/\s+/g, ""),
      email: email.trim().toLowerCase(),
      full_address: full_address.trim(),
      referred_by_user_id: referred_by?.trim() || null,
      follow_proof_url: body.follow_proof_url?.trim() || null,
    };

    // ── Cek duplikat (phone atau email yang sudah pernah daftar) ─────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: existing } = await supabase
      .from("partners")
      .select("id, status")
      .or(`phone.eq.${sanitized.phone},email.eq.${sanitized.email}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const statusMsg =
        existing.status === "PENDING"
          ? "Pendaftaran Anda sedang menunggu persetujuan"
          : existing.status === "APPROVED"
          ? "Anda sudah terdaftar sebagai Mitra/Reseller"
          : "Pendaftaran sebelumnya ditolak, silakan hubungi admin";
      return NextResponse.json(
        { success: false, message: statusMsg, existing_status: existing.status },
        { status: 409, headers }
      );
    }

    // ── Validasi referred_by_user_id (kalau ada, pastikan user-nya exist) ────
    if (sanitized.referred_by_user_id) {
      const { data: referrer } = await supabase
        .from("users")
        .select("id")
        .eq("id", sanitized.referred_by_user_id)
        .maybeSingle();

      if (!referrer) {
        // Referrer gak valid → tetap simpan tapi set null (gak blokir pendaftaran)
        sanitized.referred_by_user_id = null;
      }
    }

    // ── Insert ──────────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from("partners")
      .insert(sanitized)
      .select("id, type, status, created_at")
      .single();

    if (error) {
      console.error("[partners/register] insert error:", error);
      return NextResponse.json(
        { success: false, message: "Gagal menyimpan pendaftaran" },
        { status: 500, headers }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Pendaftaran berhasil! Tim kami akan menghubungi Anda segera.",
        data,
      },
      { status: 201, headers }
    );
  } catch (err) {
    console.error("[partners/register] unexpected error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500, headers }
    );
  }
}