// src/app/api/service/stream/internal/route.ts
// SSE untuk halaman internal dashboard — butuh auth cookie

import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { SERVICE_VIEW_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/permissions";

async function fetchAllOrders() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("service_orders")
    .select(`
      *,
      created_by_user:users!service_orders_created_by_fkey(id, name),
      dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(id, name),
      diambil_by_user:users!service_orders_diambil_by_fkey(id, name),
      payment_by_user:users!service_orders_payment_by_fkey(id, name)
    `)
    .order("tanggal_masuk", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function GET(req: NextRequest) {
  // Auth check
  const token = req.cookies.get("token")?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await verifyToken(token);
  if (!user || !SERVICE_VIEW_ROLES.includes(user.role as UserRole)) {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // Data awal
      try {
        const orders = await fetchAllOrders();
        send("init", { orders });
      } catch {
        send("error", { message: "Gagal memuat data awal" });
      }

      // Supabase Realtime
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const channel = supabase
        .channel(`dashboard_service_${user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "service_orders",
        }, async () => {
          try {
            const orders = await fetchAllOrders();
            send("update", { orders });
          } catch {
            send("error", { message: "Gagal memuat update" });
          }
        })
        .subscribe();

      // Heartbeat 25 detik
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
    },
  });
}