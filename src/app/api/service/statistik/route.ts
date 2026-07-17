import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser } from "@/lib/auth";
import { SERVICE_VIEW_ROLES } from "@/lib/permissions";

// Admin client — bypass RLS, sama seperti route servis lainnya
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Teknisi (termasuk PKL Teknisi) yang muncul di statistik
const TECHNICIAN_ROLES = ["TEKNISI", "KEPALA_TEKNISI", "PKL_TEKNISI"];

// Status yang dianggap "selesai dikerjakan"
const COMPLETED_STATUSES = ["DONE", "SUDAH_DIAMBIL", "GAGAL_DIPERBAIKI"];

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

interface ServiceRow {
  id: string;
  type_laptop: string | null; // nama unit
  keluhan: string | null;
  status: string | null;
  tanggal_masuk: string | null; // masuk antrian
  mulai_dikerjakan: string | null; // dari log SEDANG_DIKERJAKAN
  tanggal_selesai: string | null; // selesai
  pengerjaanMs: number | null; // mulai dikerjakan → selesai
  penyelesaianMs: number | null; // masuk antrian → selesai
}

interface TechAcc {
  id: string;
  name: string;
  total: number;
  pengerjaanMs: number[];
  penyelesaianMs: number[];
  orders: ServiceRow[];
}

async function handler(req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const { key, from } = resolveRange(url.searchParams.get("range"));
    const supabase = getAdmin();

    // 1) Teknisi aktif (termasuk PKL Teknisi). PKL nonaktif otomatis hilang.
    const { data: activeUsers, error: userErr } = await supabase
      .from("users")
      .select("id, name, role, is_active")
      .in("role", TECHNICIAN_ROLES)
      .eq("is_active", true);
    if (userErr) throw userErr;

    const techs = new Map<string, TechAcc>();
    for (const u of activeUsers ?? []) {
      techs.set(u.id as string, {
        id: u.id as string,
        name: (u.name as string) ?? "—",
        total: 0,
        pengerjaanMs: [],
        penyelesaianMs: [],
        orders: [],
      });
    }

    // 2) Order servis dalam periode (berbasis kapan masuk antrian)
    const { data: orders, error: orderErr } = await supabase
      .from("service_orders")
      .select(
        "id, type_laptop, keluhan, status, tanggal_masuk, tanggal_selesai, dikerjakan_by"
      )
      .not("dikerjakan_by", "is", null)
      .gte("tanggal_masuk", from)
      .order("tanggal_masuk", { ascending: false })
      .limit(5000);
    if (orderErr) throw orderErr;

    const orderIds = (orders ?? []).map((o) => o.id as string);

    // 3) Waktu "mulai dikerjakan" diambil dari log transisi ke SEDANG_DIKERJAKAN
    //    (kolom tanggal_mulai tidak ada di service_orders).
    const startMap = new Map<string, string>();
    if (orderIds.length) {
      const { data: logs, error: logErr } = await supabase
        .from("service_order_logs")
        .select("service_order_id, changed_at")
        .eq("status_to", "SEDANG_DIKERJAKAN")
        .in("service_order_id", orderIds)
        .order("changed_at", { ascending: true });
      if (logErr) throw logErr;
      for (const l of logs ?? []) {
        const oid = l.service_order_id as string;
        // ascending → simpan yang paling awal saja
        if (!startMap.has(oid)) startMap.set(oid, l.changed_at as string);
      }
    }

    for (const o of orders ?? []) {
      const uid = o.dikerjakan_by as string | null;
      if (!uid) continue;
      const acc = techs.get(uid); // hanya teknisi aktif
      if (!acc) continue;

      const mulai = startMap.get(o.id as string) ?? null;
      const selesai = (o.tanggal_selesai as string) ?? null;
      const masuk = (o.tanggal_masuk as string) ?? null;

      const pengerjaanMs =
        mulai && selesai
          ? new Date(selesai).getTime() - new Date(mulai).getTime()
          : null;
      const penyelesaianMs =
        masuk && selesai
          ? new Date(selesai).getTime() - new Date(masuk).getTime()
          : null;

      if (COMPLETED_STATUSES.includes(o.status as string)) acc.total += 1;
      if (pengerjaanMs != null && pengerjaanMs > 0) acc.pengerjaanMs.push(pengerjaanMs);
      if (penyelesaianMs != null && penyelesaianMs > 0)
        acc.penyelesaianMs.push(penyelesaianMs);

      acc.orders.push({
        id: o.id as string,
        type_laptop: (o.type_laptop as string) ?? null,
        keluhan: (o.keluhan as string) ?? null,
        status: (o.status as string) ?? null,
        tanggal_masuk: masuk,
        mulai_dikerjakan: mulai,
        tanggal_selesai: selesai,
        pengerjaanMs: pengerjaanMs && pengerjaanMs > 0 ? pengerjaanMs : null,
        penyelesaianMs: penyelesaianMs && penyelesaianMs > 0 ? penyelesaianMs : null,
      });
    }

    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const avg = (a: number[]) => (a.length ? Math.round(sum(a) / a.length) : 0);

    const rows = Array.from(techs.values())
      .map((t) => ({
        id: t.id,
        name: t.name,
        total: t.total,
        pengerjaanTotalMs: sum(t.pengerjaanMs),
        pengerjaanAvgMs: avg(t.pengerjaanMs),
        penyelesaianTotalMs: sum(t.penyelesaianMs),
        penyelesaianAvgMs: avg(t.penyelesaianMs),
        avgMs: avg(t.pengerjaanMs), // "Rata-rata" = rata-rata waktu pengerjaan per unit
        orders: t.orders,
      }))
      .sort((a, b) => b.total - a.total || a.pengerjaanAvgMs - b.pengerjaanAvgMs);

    return NextResponse.json({ success: true, range: { key, from }, rows });
  } catch (err) {
    console.error("[GET /api/service/statistik]", err);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil statistik servis" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler, SERVICE_VIEW_ROLES);
