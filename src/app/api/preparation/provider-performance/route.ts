import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { PROVIDER_PERFORMANCE_VIEW_ROLES, PROVIDER_PERFORMANCE_ROLES } from "@/lib/permissions";

interface ProviderUserRow {
  id: string;
  name: string;
  role: string;
}

interface OrderDoneRow {
  id: string;
  order_number: string;
  customer_name: string;
  done_by: string | null;
  received_at: string | null;
  done_at: string | null;
}

interface JobDetail {
  id: string;
  order_number: string;
  customer_name: string;
  received_at: string | null;
  done_at: string;
  duration_hours: number | null;
}

interface ProviderPerformance {
  id: string;
  name: string;
  role: string;
  total_pekerjaan: number;
  jam_terbang: number; // dipakai untuk akumulasi mentah, lalu dibulatkan sebelum dikirim
  rata_rata: number | null;
  jobs: JobDetail[];
}

// Batas jumlah order yang diproses per request biar query tetap ringan (bisa dinaikkan kalau perlu)
const MAX_ORDERS = 3000;
// Batas detail job per provider yang dikirim ke modal (biar payload tidak kebesaran)
const MAX_JOBS_PER_PROVIDER = 200;

async function getHandler(req: NextRequest, _ctx: any, _user: AuthUser) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // 1) Ambil semua akun dengan role Penyedia Barang (Kepala / Anggota / PKL)
    //    ASUMSI: tabel "users" punya kolom "role" (single/legacy).
    //    Kalau di project ini role disimpan multi-role via tabel terpisah (mis. user_roles),
    //    ganti query di bawah ini jadi join/filter ke tabel tsb.
    const { data: providerUsers, error: userErr } = await supabase
      .from("users")
      .select("id, name, role")
      .in("role", PROVIDER_PERFORMANCE_ROLES);

    if (userErr) throw userErr;

    const providers = (providerUsers ?? []) as ProviderUserRow[];
    if (providers.length === 0) {
      return NextResponse.json({ success: true, range: { from, to }, providers: [] });
    }
    const providerIds = providers.map((p) => p.id);

    // 2) Ambil semua order yang sudah SELESAI dicek (done_at terisi) oleh akun-akun tsb,
    //    difilter berdasarkan kapan pekerjaan itu diselesaikan (done_at)
    let query = supabase
      .from("preparation_orders")
      .select("id, order_number, customer_name, done_by, received_at, done_at")
      .in("done_by", providerIds)
      .not("done_at", "is", null)
      .order("done_at", { ascending: false })
      .limit(MAX_ORDERS);

    if (from) query = query.gte("done_at", from);
    if (to) query = query.lt("done_at", to);

    const { data: ordersRaw, error: orderErr } = await query;
    if (orderErr) throw orderErr;
    const orders = (ordersRaw ?? []) as OrderDoneRow[];

    // 3) Agregasi per provider (semua provider dimunculkan walau total_pekerjaan = 0)
    const byProvider = new Map<string, ProviderPerformance>();
    for (const p of providers) {
      byProvider.set(p.id, {
        id: p.id,
        name: p.name,
        role: p.role,
        total_pekerjaan: 0,
        jam_terbang: 0,
        rata_rata: null,
        jobs: [],
      });
    }

    for (const o of orders) {
      if (!o.done_by) continue;
      const entry = byProvider.get(o.done_by);
      if (!entry) continue; // safety net

      const durationHours =
        o.received_at && o.done_at
          ? Math.max(0, (new Date(o.done_at).getTime() - new Date(o.received_at).getTime()) / 3_600_000)
          : null;

      entry.total_pekerjaan += 1;
      if (durationHours != null) entry.jam_terbang += durationHours;

      if (entry.jobs.length < MAX_JOBS_PER_PROVIDER) {
        entry.jobs.push({
          id: o.id,
          order_number: o.order_number,
          customer_name: o.customer_name,
          received_at: o.received_at,
          done_at: o.done_at as string,
          duration_hours: durationHours != null ? Math.round(durationHours * 100) / 100 : null,
        });
      }
    }

    // 4) Finalisasi angka: jam_terbang dibulatkan, rata_rata = jam_terbang / total_pekerjaan
    const result: ProviderPerformance[] = Array.from(byProvider.values()).map((p) => {
      const rawHours = p.jam_terbang;
      const rata = p.total_pekerjaan > 0 ? rawHours / p.total_pekerjaan : null;
      return {
        ...p,
        jam_terbang: Math.round(rawHours * 100) / 100,
        rata_rata: rata != null ? Math.round(rata * 100) / 100 : null,
      };
    });

    // 5) Ranking: total pekerjaan terbanyak = #1, tie-break rata-rata tercepat.
    //    Mau ranking berdasarkan KECEPATAN (rata-rata terkecil) sebagai prioritas utama?
    //    Tinggal tukar urutan pengecekan total_pekerjaan <-> rata_rata di bawah ini.
    result.sort((a, b) => {
      if (b.total_pekerjaan !== a.total_pekerjaan) return b.total_pekerjaan - a.total_pekerjaan;
      if (a.rata_rata == null && b.rata_rata == null) return 0;
      if (a.rata_rata == null) return 1;
      if (b.rata_rata == null) return -1;
      return a.rata_rata - b.rata_rata;
    });

    return NextResponse.json({ success: true, range: { from, to }, providers: result });
  } catch (err: any) {
    console.error("[GET /api/preparation/provider-performance]", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Gagal mengambil data performa penyedia" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler, PROVIDER_PERFORMANCE_VIEW_ROLES);