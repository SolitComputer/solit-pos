// src/app/api/dashboard/service-stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth, PERMISSIONS } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Role yang boleh akses
const SERVICE_DASHBOARD_ROLES = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "TEKNISI", "KEPALA_TEKNISI", "CUSTOMER_SERVICE",
];

async function handler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  if (!SERVICE_DASHBOARD_ROLES.includes(user.role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const supabase = getAdmin();

  // Fetch semua order yang masih aktif & hari ini
  const [
    { data: antrian },
    { data: sedangDikerjakan },
    { data: menungguSparepart },
    { data: done },
    { data: gagal },
    { data: sudahDiambilHariIni },
  ] = await Promise.all([
    supabase.from("service_orders").select("id").eq("status", "ANTRIAN"),
    supabase.from("service_orders").select("id").eq("status", "SEDANG_DIKERJAKAN"),
    supabase.from("service_orders").select("id").eq("status", "MENUNGGU_SPAREPART"),
    supabase.from("service_orders").select("id").eq("status", "DONE"),
    supabase.from("service_orders").select("id").eq("status", "GAGAL_DIPERBAIKI"),
    // Sudah diambil hari ini (WIB)
    supabase.from("service_orders")
      .select("id, payment_amount")
      .eq("status", "SUDAH_DIAMBIL")
      .gte("tanggal_diambil", (() => {
        const WIB = 7 * 60 * 60 * 1000;
        const nowWIB = new Date(Date.now() + WIB);
        const dateStr = nowWIB.toISOString().split("T")[0];
        const [y, m, d] = dateStr.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - WIB).toISOString();
      })()),
  ]);

  // Hitung total pendapatan servis hari ini
  const pendapatanHariIni = (sudahDiambilHariIni ?? []).reduce(
    (acc, o) => acc + (Number(o.payment_amount) || 0), 0
  );

  // Order paling lama menunggu (ANTRIAN) — ambil 3 terlama
  const { data: terlamaAntrian } = await supabase
    .from("service_orders")
    .select("no_urut, nama, type_laptop, tanggal_masuk, status")
    .eq("status", "ANTRIAN")
    .order("tanggal_masuk", { ascending: true })
    .limit(3);

  // Sedang dikerjakan sekarang
  const { data: sedangDetail } = await supabase
    .from("service_orders")
    .select("no_urut, nama, type_laptop, tanggal_masuk, dikerjakan_by_user:users!service_orders_dikerjakan_by_fkey(name)")
    .eq("status", "SEDANG_DIKERJAKAN")
    .order("tanggal_masuk", { ascending: true })
    .limit(5);

  return NextResponse.json({
    success: true,
    data: {
      antrian: antrian?.length ?? 0,
      sedangDikerjakan: sedangDikerjakan?.length ?? 0,
      menungguSparepart: menungguSparepart?.length ?? 0,
      done: done?.length ?? 0,
      gagal: gagal?.length ?? 0,
      sudahDiambilHariIni: sudahDiambilHariIni?.length ?? 0,
      pendapatanHariIni,
      terlamaAntrian: terlamaAntrian ?? [],
      sedangDetail: sedangDetail ?? [],
    },
  });
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);