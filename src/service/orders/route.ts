// src/app/api/service/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = [
  "https://solit03.com",
  "https://www.solit03.com",
  "http://localhost:5173",
  "http://localhost:3001",
  "http://localhost:3000",
];

// ✅ reuse 1 client antar warm invocation (module scope, bukan per-request)
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return _supabase;
}

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    Vary: "Origin",
  };
}

function sensorNama(nama: string): string {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [first, ...rest] = parts;
  return `${first} ${rest.map((p) => `${p[0].toUpperCase()}.`).join(" ")}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("service_orders")
      .select("no_urut, nama, type_laptop, status, tanggal_masuk, tanggal_selesai")
      .in("status", ["ANTRIAN", "SEDANG_DIKERJAKAN", "MENUNGGU_SPAREPART", "DONE"])
      .order("no_urut", { ascending: true });

    if (error) throw error;

    const orders = (data ?? []).map((o) => ({
      ...o,
      nama: sensorNama(o.nama),
      tanggal_selesai: o.tanggal_selesai ?? null,
    }));

    return NextResponse.json(
      { orders, total: orders.length },
      {
        headers: {
          ...corsHeaders(req),
          // ✅ CDN cache 15 detik → poll berulang dalam window ini = 0 invocation
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Gagal memuat data" },
      { status: 500, headers: corsHeaders(req) }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}