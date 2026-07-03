import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser } from "@/lib/auth";
import { PREPARATION_VIEW_ROLES } from "@/lib/permissions";
import { haversineM } from "@/lib/geo";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

interface OrderRow {
  id: string; order_number: string; customer_name: string;
  delivery_user_id: string | null; delivery_user_name: string | null;
  delivery_method: string | null; delivery_address: string | null; status: string;
  delivery_started_at: string | null; delivered_at: string | null;
  return_started_at: string | null; returned_at: string | null;
  delivery_distance_m: number | null; delivery_duration_s: number | null;
}
interface TP { lat: number; lng: number; t: number; speed: number | null; phase: string | null }

// Jumlah berhenti (diam ≥45 dtk radius 25m). Titik harus urut asc.
function countStops(points: TP[]): number {
  let stops = 0, i = 0;
  while (i < points.length) {
    let j = i + 1;
    while (j < points.length && haversineM(points[i], points[j]) < 25) j++;
    const durS = (points[j - 1].t - points[i].t) / 1000;
    if (durS >= 45 && j - i >= 2) stops++;
    i = j > i ? j : i + 1;
  }
  return stops;
}

async function getHandler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

   let query = admin
      .from("preparation_orders")
      .select(`id, order_number, customer_name, delivery_user_id, delivery_user_name,
               delivery_method, delivery_address, status,
               delivery_started_at, delivered_at, return_started_at, returned_at,
               delivery_distance_m, delivery_duration_s`)
      .eq("delivery_method", "PENGANTARAN")
      // ⛔ dulu: .not("delivery_started_at", "is", null) — ini buang order force-complete
      // ✅ sekarang: cukup yang sudah jalan ATAU sudah selesai (delivered_at keisi)
      .or("delivery_started_at.not.is.null,delivered_at.not.is.null")
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .limit(300);

    // Anchor rentang tanggal ke delivered_at (selalu terisi saat order kelar,
    // termasuk hasil force-complete). Order yang masih BERLANGSUNG (delivered_at null)
    // tetap ikut karena lolos .or() di atas & tak terpotong filter tanggal delivered_at.
    if (from) query = query.or(`delivered_at.gte.${from},and(delivered_at.is.null,delivery_started_at.gte.${from})`);
    if (to)   query = query.or(`delivered_at.lte.${to},and(delivered_at.is.null,delivery_started_at.lte.${to})`);
    const { data: ordersRaw, error } = await query;
    if (error) throw error;
    const orders = (ordersRaw ?? []) as OrderRow[];
    const ids = orders.map((o) => o.id);

    // Ambil semua titik tracking untuk order2 ini sekaligus (1 query)
    const trackingByOrder = new Map<string, TP[]>();
    if (ids.length) {
      const { data: tracks } = await admin
        .from("delivery_tracking")
        .select("preparation_id, lat, lng, speed, phase, recorded_at")
        .in("preparation_id", ids)
        .order("recorded_at", { ascending: true })
        .limit(40000);
      for (const t of tracks ?? []) {
        const arr = trackingByOrder.get(t.preparation_id) ?? [];
        arr.push({ lat: t.lat, lng: t.lng, t: new Date(t.recorded_at).getTime(), speed: t.speed, phase: t.phase });
        trackingByOrder.set(t.preparation_id, arr);
      }
    }

    const secs = (a: string | null, b: string | null) =>
      a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000) : null;

    const trips = orders.map((o) => {
      const pts = trackingByOrder.get(o.id) ?? [];
      const goPts = pts.filter((p) => p.phase !== "RETURN");

      let trackedDist = 0;
      for (let i = 1; i < goPts.length; i++) trackedDist += haversineM(goPts[i - 1], goPts[i]);
      trackedDist = Math.round(trackedDist);

      const durAntarS = secs(o.delivery_started_at, o.delivered_at);
      const durPulangS = secs(o.return_started_at, o.returned_at);

      const maxSpeedKmh = pts.reduce((m, p) => {
        const s = p.speed != null ? p.speed * 3.6 : 0;
        return s > m && s < 160 ? s : m; // buang lompatan GPS
      }, 0);
      const avgSpeedKmh = trackedDist > 0 && durAntarS && durAntarS > 0
        ? (trackedDist / durAntarS) * 3.6 : null;

      return {
        id: o.id, order_number: o.order_number, customer_name: o.customer_name,
        delivery_user_id: o.delivery_user_id, delivery_user_name: o.delivery_user_name,
        delivery_address: o.delivery_address, status: o.status,
        delivery_started_at: o.delivery_started_at, delivered_at: o.delivered_at,
        return_started_at: o.return_started_at, returned_at: o.returned_at,
        tracked_distance_m: trackedDist, plan_distance_m: o.delivery_distance_m,
        dur_antar_s: durAntarS, dur_pulang_s: durPulangS,
        avg_speed_kmh: avgSpeedKmh, max_speed_kmh: maxSpeedKmh || null,
        stops: countStops(pts), point_count: pts.length,
      };
    });

    return NextResponse.json({ success: true, trips });
  } catch (err) {
    console.error("[GET /api/preparation/history]", err);
    const message = err instanceof Error ? err.message : "Gagal mengambil history";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PREPARATION_VIEW_ROLES);