// src/app/api/preparation/public/route.ts
// PUBLIC — penyiapan untuk display board solit03.com (tanpa auth, CORS). Niru service/public.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const ALLOWED_ORIGINS = [
  "https://solit03.com",
  "https://www.solit03.com",
  "https://solit.id",
  "https://www.solit.id",
  "http://localhost:5173",
  "http://localhost:3001",
];

function getCorsOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

// Status penyiapan yang tampil di board publik (Menunggu → Diproses → Selesai)
const PUBLIC_STATUSES = ["MENUNGGU", "DIPROSES", "SELESAI"];

function sensorNama(nama: string): string {
  if (!nama) return "—";
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [first, ...rest] = parts;
  return `${first} ${rest.map((p) => `${p[0].toUpperCase()}.`).join(" ")}`;
}

function sensorHp(hp: string | null): string | null {
  if (!hp) return null;
  const d = hp.replace(/\D/g, "");
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}${"x".repeat(d.length - 6)}`;
}

export async function GET(req: NextRequest) {
  const corsOrigin = getCorsOrigin(req);
  const corsHeaders = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };

  const supabase = getAdmin();

  // SELESAI hanya 1 hari terakhir biar board tidak penuh riwayat lama
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("preparation_orders")
    .select("order_number, customer_name, customer_phone, status, created_at, scheduled_delivery_date, created_by_name, preparation_items(id)")
    .in("status", PUBLIC_STATUSES)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data penyiapan" },
      { status: 500, headers: corsHeaders }
    );
  }

  const filtered = (data ?? []).filter((o: any) =>
    o.status !== "SELESAI" ? true : o.created_at >= oneDayAgo
  );

  const sanitized = filtered.map((o: any) => ({
    order_number: o.order_number,
    nama: sensorNama(o.customer_name),
    no_hp: sensorHp(o.customer_phone),
    status: o.status,
    qty: Array.isArray(o.preparation_items) ? o.preparation_items.length : 0,
    created_at: o.created_at,
    scheduled_delivery_date: o.scheduled_delivery_date ?? null,
    penyedia: o.created_by_name ?? null,
  }));

  return NextResponse.json(
    { success: true, data: sanitized, total: sanitized.length },
    { headers: corsHeaders }
  );
}

export async function OPTIONS(req: NextRequest) {
  const corsOrigin = getCorsOrigin(req);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}