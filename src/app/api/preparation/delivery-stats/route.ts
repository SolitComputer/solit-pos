import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser } from "@/lib/auth";
import {
  DELIVERY_LEADERBOARD_VIEW_ROLES,
  PREPARATION_DELIVERY_PERSON_ROLES,
} from "@/lib/permissions";

// Admin client — bypass RLS, sama seperti route pengantaran lainnya
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Periode (rolling window) — sesuai papan: 1 hari, 7 hari, 1 bulan, 3 bulan, 1 tahun
const RANGE_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "1m": 30,
  "3m": 90,
  "1y": 365,
};

function resolveRange(key: string | null): { key: string; from: string } {
  const k = key && RANGE_DAYS[key] ? key : "7d";
  const from = new Date(Date.now() - RANGE_DAYS[k] * 24 * 3600_000).toISOString();
  return { key: k, from };
}

interface DeliveryRow {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  status: string | null;
  dispatched_at: string | null;
  delivery_accepted_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
  tempuhMs: number | null; // mulai antar → sampai tujuan
  selesaiMs: number | null; // job diterima → SELESAI
}

interface CourierAcc {
  id: string;
  name: string;
  total: number; // pengantaran yang diselesaikan
  tempuhMs: number[];
  selesaiMs: number[];
  deliveries: DeliveryRow[];
}

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const { key, from } = resolveRange(url.searchParams.get("range"));

    // 1) Kurir aktif (PENGANTARAN + PKL_PENGANTARAN, is_active=true).
    //    PKL yang sudah nonaktif otomatis tidak masuk daftar.
    const { data: activeUsers, error: userErr } = await admin
      .from("users")
      .select("id, name, role, is_active")
      .in("role", PREPARATION_DELIVERY_PERSON_ROLES)
      .eq("is_active", true);

    if (userErr) throw userErr;

    const couriers = new Map<string, CourierAcc>();
    for (const u of activeUsers ?? []) {
      couriers.set(u.id as string, {
        id: u.id as string,
        name: (u.name as string) ?? "—",
        total: 0,
        tempuhMs: [],
        selesaiMs: [],
        deliveries: [],
      });
    }

    // 2) Semua pengantaran dalam periode (berbasis kapan tugas ditugaskan)
    const { data: orders, error: orderErr } = await admin
      .from("preparation_orders")
      .select(
        "id, order_number, customer_name, status, delivery_user_id, delivery_user_name, dispatched_at, delivery_accepted_at, delivery_started_at, delivered_at"
      )
      .eq("delivery_method", "PENGANTARAN")
      .not("delivery_user_id", "is", null)
      .gte("dispatched_at", from)
      .order("dispatched_at", { ascending: false })
      .limit(5000);

    if (orderErr) throw orderErr;

    for (const o of orders ?? []) {
      const uid = o.delivery_user_id as string | null;
      if (!uid) continue;
      // Hanya hitung kurir yang masih aktif
      const acc = couriers.get(uid);
      if (!acc) continue;
      if (o.delivery_user_name) acc.name = o.delivery_user_name as string;

      const tempuhMs =
        o.delivery_started_at && o.delivered_at
          ? new Date(o.delivered_at as string).getTime() -
            new Date(o.delivery_started_at as string).getTime()
          : null;
      const selesaiMs =
        o.delivery_accepted_at && o.delivered_at
          ? new Date(o.delivered_at as string).getTime() -
            new Date(o.delivery_accepted_at as string).getTime()
          : null;

      if (o.status === "SELESAI" || o.delivered_at) acc.total += 1;
      if (tempuhMs != null && tempuhMs > 0) acc.tempuhMs.push(tempuhMs);
      if (selesaiMs != null && selesaiMs > 0) acc.selesaiMs.push(selesaiMs);

      acc.deliveries.push({
        id: o.id as string,
        order_number: (o.order_number as string) ?? null,
        customer_name: (o.customer_name as string) ?? null,
        status: (o.status as string) ?? null,
        dispatched_at: (o.dispatched_at as string) ?? null,
        delivery_accepted_at: (o.delivery_accepted_at as string) ?? null,
        delivery_started_at: (o.delivery_started_at as string) ?? null,
        delivered_at: (o.delivered_at as string) ?? null,
        tempuhMs: tempuhMs && tempuhMs > 0 ? tempuhMs : null,
        selesaiMs: selesaiMs && selesaiMs > 0 ? selesaiMs : null,
      });
    }

    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const avg = (a: number[]) => (a.length ? Math.round(sum(a) / a.length) : 0);

    const rows = Array.from(couriers.values())
      .map((c) => ({
        id: c.id,
        name: c.name,
        total: c.total,
        tempuhTotalMs: sum(c.tempuhMs),
        tempuhAvgMs: avg(c.tempuhMs),
        selesaiTotalMs: sum(c.selesaiMs),
        selesaiAvgMs: avg(c.selesaiMs),
        avgMs: avg(c.tempuhMs), // "Rata-rata" = rata-rata waktu tempuh per pengantaran
        deliveries: c.deliveries,
      }))
      // Urutkan: yang paling banyak menyelesaikan di atas
      .sort((a, b) => b.total - a.total || a.tempuhAvgMs - b.tempuhAvgMs);

    return NextResponse.json({ success: true, range: { key, from }, rows });
  } catch (err) {
    console.error("[GET /api/preparation/delivery-stats]", err);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil statistik pengantaran" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler, DELIVERY_LEADERBOARD_VIEW_ROLES);
