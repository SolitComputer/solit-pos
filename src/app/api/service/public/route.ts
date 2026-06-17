
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  // CORS — izinkan solit03.com dan localhost dev
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = [
    "https://solit03.com",
    "https://www.solit03.com",
    "http://localhost:5173",
    "http://localhost:3001",
  ];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const corsHeaders = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabase = getAdmin();

  // Hanya ambil order yang aktif (tidak expose history/sudah diambil)
  const { data, error } = await supabase
    .from("service_orders")
    .select("no_urut, nama, type_laptop, status, tanggal_masuk, tanggal_selesai")
    .in("status", ["ANTRIAN", "SEDANG_DIKERJAKAN", "MENUNGGU_SPAREPART", "DONE"])
    .order("no_urut", { ascending: true });

  if (error) {
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data antrian" },
      { status: 500, headers: corsHeaders }
    );
  }

  // Sensor nama: hanya tampilkan nama depan + inisial belakang
  // cth: "Budi Santoso" → "Budi S."
  const sanitized = (data ?? []).map(o => ({
    no_urut: o.no_urut,
    nama: sensorNama(o.nama),
    type_laptop: o.type_laptop,
    status: o.status,
    tanggal_masuk: o.tanggal_masuk,
    tanggal_selesai: o.tanggal_selesai ?? null,
  }));

  return NextResponse.json(
    { success: true, data: sanitized, total: sanitized.length },
    { headers: corsHeaders }
  );
}

// OPTIONS handler untuk CORS preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigins = [
    "https://solit03.com",
    "https://www.solit03.com",
    "http://localhost:5173",
    "http://localhost:3001",
  ];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Sensor nama: "Budi Santoso Wijaya" → "Budi S. W."
function sensorNama(nama: string): string {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]; // nama tunggal, tampilkan utuh
  const [first, ...rest] = parts;
  return `${first} ${rest.map(p => p[0].toUpperCase() + ".").join(" ")}`;
}