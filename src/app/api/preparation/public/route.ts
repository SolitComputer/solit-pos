// src/app/api/preparation/public/route.ts
// PUBLIC — penyiapan untuk board solit03.com. Pakai kolom native received_*/done_*,
// + enrichment type barang & spek (cpu/ram/storage) dari item utama tiap order.

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

// Barang masih di toko → tampil. DIKIRIM/SELESAI/DIBATALKAN tidak tampil.
const PUBLIC_STATUSES = ["MENUNGGU", "DIPROSES", "SIAP_KIRIM"];

// 00:00 WIB hari ini dalam ISO (untuk filter "data hari ini saja")
function startOfTodayWIBISO(): string {
  const nowWIB = new Date(Date.now() + 7 * 3600_000);
  const y = nowWIB.getUTCFullYear();
  const m = nowWIB.getUTCMonth();
  const d = nowWIB.getUTCDate();
  return new Date(Date.UTC(y, m, d, -7, 0, 0)).toISOString();
}

function sensorNama(nama: string | null): string {
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

  const { data: orders, error } = await supabase
    .from("preparation_orders")
    .select(
      `order_number, customer_name, customer_phone, status, created_at, received_by_name, received_at, done_at,
       preparation_items ( serial_number, laptop_name, laptop_id, item_type, is_cancelled )`
    )
    .in("status", PUBLIC_STATUSES)
    .gte("created_at", startOfTodayWIBISO()) // reset harian
    .order("created_at", { ascending: false }); // terbaru dulu

  if (error) {
    return NextResponse.json(
      { success: false, message: "Gagal mengambil data penyiapan" },
      { status: 500, headers: corsHeaders }
    );
  }

  // ── Enrichment type barang + spek (pola sama dengan GET /api/preparation/[id]) ──
  const allItems = (orders ?? []).flatMap((o: any) => o.preparation_items ?? []);
  const laptopItems = allItems.filter((it: any) => it.item_type !== "accessory" && !it.is_cancelled);

  // resolve laptop_id dari SN untuk item yang belum punya
  const missingSns = [
    ...new Set(laptopItems.filter((it: any) => !it.laptop_id && it.serial_number).map((it: any) => it.serial_number)),
  ] as string[];
  let snToLaptop = new Map<string, string>();
  if (missingSns.length > 0) {
    const { data: units } = await supabase
      .from("laptop_units")
      .select("serial_number, laptop_id")
      .in("serial_number", missingSns);
    snToLaptop = new Map((units ?? []).filter((u: any) => u.laptop_id).map((u: any) => [u.serial_number, u.laptop_id]));
  }

  const laptopIds = [
    ...new Set(laptopItems.map((it: any) => it.laptop_id ?? snToLaptop.get(it.serial_number)).filter(Boolean)),
  ] as string[];
  let laptopMap = new Map<string, any>();
  if (laptopIds.length > 0) {
    const { data: laptops } = await supabase
      .from("laptops")
      .select("id, laptop_name, cpu, ram, storage")
      .in("id", laptopIds);
    laptopMap = new Map((laptops ?? []).map((l: any) => [l.id, l]));
  }

  const sanitized = (orders ?? []).map((o: any) => {
    const items = o.preparation_items ?? [];
    // model utama = laptop pertama yang belum dibatalkan (fallback item pertama)
    const primary =
      items.find((it: any) => it.item_type !== "accessory" && !it.is_cancelled) ??
      items.find((it: any) => !it.is_cancelled) ??
      items[0] ??
      null;

    let type_barang: string | null = primary?.laptop_name ?? null;
    let spek: { cpu: string | null; ram: string | null; storage: string | null } | null = null;
    if (primary) {
      const lid = primary.laptop_id ?? snToLaptop.get(primary.serial_number) ?? null;
      const lap = lid ? laptopMap.get(lid) : null;
      if (lap) {
        type_barang = type_barang ?? lap.laptop_name ?? null;
        spek = { cpu: lap.cpu ?? null, ram: lap.ram ?? null, storage: lap.storage ?? null };
      }
    }

    const qty = items.filter((it: any) => !it.is_cancelled).length;

    return {
      order_number: o.order_number,
      nama: sensorNama(o.customer_name),
      no_hp: sensorHp(o.customer_phone),
      status: o.status,
      qty,
      type_barang: type_barang ?? "—",
      spek, // { cpu, ram, storage } | null
      disiapkan_oleh: o.received_by_name ?? null, // titik 2
      tanggal_masuk: o.created_at,                // titik 1
      tanggal_diproses: o.received_at ?? null,    // titik 2 (native)
      tanggal_selesai: o.done_at ?? null,         // titik 3 (native)
    };
  });

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