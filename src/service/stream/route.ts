// E:\solit-pos\src\app\api\service\stream\route.ts
// Server-Sent Events endpoint — publik, push update realtime ke solit03.com

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

// Sensor nama: "Budi Santoso" → "Budi S."
function sensorNama(nama: string): string {
  const parts = nama.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const [first, ...rest] = parts;
  return `${first} ${rest.map((p) => `${p[0].toUpperCase()}.`).join(" ")}`;
}

async function fetchCurrentOrders() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("service_orders")
    .select("no_urut, nama, type_laptop, status, tanggal_masuk, tanggal_selesai")
    .in("status", ["ANTRIAN", "SEDANG_DIKERJAKAN", "MENUNGGU_SPAREPART", "DONE"])
    .order("no_urut", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((o) => ({
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

  // SSE menggunakan ReadableStream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller sudah closed (client disconnect)
        }
      };

      // Kirim data awal saat connect
      try {
        const orders = await fetchCurrentOrders();
        send("init", { orders, total: orders.length });
      } catch (err) {
        send("error", { message: "Gagal memuat data awal" });
      }

      // Setup Supabase Realtime subscription
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const channel = supabase
        .channel("service_orders_public")
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE
            schema: "public",
            table: "service_orders",
          },
          async (payload) => {
            // Setiap ada perubahan → fetch ulang data terbaru dan push
            try {
              const orders = await fetchCurrentOrders();
              send("update", { orders, total: orders.length });
            } catch {
              send("error", { message: "Gagal memuat update" });
            }
          }
        )
        .subscribe();

      // Heartbeat setiap 25 detik agar koneksi tidak di-drop proxy/CDN
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      // Cleanup saat client disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        supabase.removeChannel(channel);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
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