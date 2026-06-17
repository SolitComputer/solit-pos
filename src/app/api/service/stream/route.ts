// src/app/api/service/stream/route.ts
// PUBLIC SSE — DONE hanya tampil 3 hari, tambah GAGAL_DIPERBAIKI

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = [
  "https://solit03.com",
  "https://www.solit03.com",
  "http://localhost:5173",
  "http://localhost:3001",
  "http://localhost:3000",
];

function getCorsOrigin(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : "*";
}

function sensorNama(nama: string): string {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [first, ...rest] = parts;
  return `${first} ${rest.map(p => `${p[0].toUpperCase()}.`).join(" ")}`;
}

async function fetchPublicOrders() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // DONE hanya tampil 3 hari terakhir
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: aktif } = await supabase
    .from("service_orders")
    .select("no_urut, nama, type_laptop, status, tanggal_masuk, tanggal_selesai")
    .in("status", ["ANTRIAN", "SEDANG_DIKERJAKAN", "MENUNGGU_SPAREPART", "GAGAL_DIPERBAIKI"])
    .order("no_urut", { ascending: true });

  const { data: done } = await supabase
    .from("service_orders")
    .select("no_urut, nama, type_laptop, status, tanggal_masuk, tanggal_selesai")
    .eq("status", "DONE")
    .gte("tanggal_selesai", threeDaysAgo) // ✅ DONE hanya 3 hari
    .order("no_urut", { ascending: true });

  const all = [...(aktif ?? []), ...(done ?? [])].sort((a, b) => a.no_urut - b.no_urut);

  return all.map(o => ({
    no_urut: o.no_urut,
    nama: sensorNama(o.nama),
    type_laptop: o.type_laptop,
    status: o.status,
    tanggal_masuk: o.tanggal_masuk,
    tanggal_selesai: o.tanggal_selesai ?? null,
  }));
}

export async function GET(req: NextRequest) {
  const corsOrigin = getCorsOrigin(req);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        const orders = await fetchPublicOrders();
        send("init", { orders, total: orders.length });
      } catch {
        send("error", { message: "Gagal memuat data" });
      }

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const channel = supabase
        .channel("service_orders_public_v2")
        .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, async () => {
          try {
            const orders = await fetchPublicOrders();
            send("update", { orders, total: orders.length });
          } catch {}
        })
        .subscribe();

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); }
        catch { clearInterval(heartbeat); }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        supabase.removeChannel(channel);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  });
}

export async function OPTIONS(req: NextRequest) {
  const corsOrigin = getCorsOrigin(req);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  });
}