import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { weekOfMonth } from "@/lib/cashflow";
import { fetchAllRows } from "@/lib/supabaseFetch";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sama seperti akses Rekap Gaji: hanya role ini yang boleh lihat/atur Kasbon & Cicilan
const KASBON_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];

function getRoles(user: any): string[] {
  return Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : user?.role ? [user.role] : [];
}
function hasAccess(user: any): boolean {
  return getRoles(user).some((r) => KASBON_ACCESS_ROLES.includes(r));
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!hasAccess(user)) return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") ?? "", 10);
    const month = parseInt(searchParams.get("month") ?? "", 10); // 1..12
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, message: "year & month wajib (month 1-12)" }, { status: 400 });
    }

    const mm = String(month).padStart(2, "0");
    const monthStart = `${year}-${mm}-01`;
    const nextMonthStart = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // Semua user aktif (tab ini admin/accounting only → tampilkan semua)
    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, name, role")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (uErr) return NextResponse.json({ success: false, message: uErr.message }, { status: 500 });

    // Saldo awal manual
    const { data: openings } = await supabase
      .from("kasbon_opening_balances")
      .select("user_id, kasbon_opening, cicilan_opening");
    const openMap: Record<string, { k: number; c: number }> = {};
    (openings ?? []).forEach((o: any) => {
      openMap[o.user_id] = { k: Number(o.kasbon_opening ?? 0), c: Number(o.cicilan_opening ?? 0) };
    });

    // Semua entry KASBON & CICILAN (semua waktu — butuh histori utk carryover)
    const entries = await fetchAllRows<any>((from, to) =>
      supabase
        .from("cashflow_entries")
        .select("direction, category, nominal, tanggal, target_user_id")
        .in("category", ["KASBON", "CICILAN"])
        .not("target_user_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
    );

    const acc: Record<string, {
      priorKasbonOut: number; priorKasbonIn: number;
      priorCicilanOut: number; priorCicilanIn: number;
      weeks: number[]; monthCicilanOut: number;
      kasbonDibayar: number; cicilanDibayar: number;
    }> = {};
    const ensure = (uid: string) => {
      if (!acc[uid]) acc[uid] = {
        priorKasbonOut: 0, priorKasbonIn: 0, priorCicilanOut: 0, priorCicilanIn: 0,
        weeks: [0, 0, 0, 0, 0], monthCicilanOut: 0, kasbonDibayar: 0, cicilanDibayar: 0,
      };
      return acc[uid];
    };

    for (const e of entries) {
      const uid = e.target_user_id as string;
      if (!uid) continue;
      const nominal = Math.round(Number(e.nominal ?? 0));
      if (!Number.isFinite(nominal) || nominal <= 0) continue;
      const tgl = String(e.tanggal ?? "");
      const isKasbon = e.category === "KASBON";
      const isOut = e.direction === "OUT";
      const a = ensure(uid);

      if (tgl < monthStart) {
        // carryover sebelum bulan ini
        if (isKasbon) isOut ? (a.priorKasbonOut += nominal) : (a.priorKasbonIn += nominal);
        else isOut ? (a.priorCicilanOut += nominal) : (a.priorCicilanIn += nominal);
      } else if (tgl < nextMonthStart) {
        // dalam bulan ini
        if (isKasbon) {
          if (isOut) a.weeks[weekOfMonth(tgl) - 1] += nominal; // ← Minggu hanya utk Kasbon
          else a.kasbonDibayar += nominal;
        } else {
          if (isOut) a.monthCicilanOut += nominal; // ← Cicilan langsung ke total
          else a.cicilanDibayar += nominal;
        }
      }
      // tanggal bulan depan → diabaikan utk tampilan bulan ini
    }

    const rows = (users ?? []).map((u: any) => {
      const a = acc[u.id];
      const open = openMap[u.id] ?? { k: 0, c: 0 };
      const weeks = a ? a.weeks : [0, 0, 0, 0, 0];
      const kasbonSebelumnya = open.k + (a ? a.priorKasbonOut - a.priorKasbonIn : 0);
      const cicilanSebelumnya = open.c + (a ? a.priorCicilanOut - a.priorCicilanIn : 0);
      const totalKasbon = kasbonSebelumnya + weeks.reduce((s, n) => s + n, 0);
      const totalCicilan = cicilanSebelumnya + (a ? a.monthCicilanOut : 0);
      const kasbonDibayar = a ? a.kasbonDibayar : 0;
      const cicilanDibayar = a ? a.cicilanDibayar : 0;
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        kasbon_sebelumnya: kasbonSebelumnya,
        cicilan_sebelumnya: cicilanSebelumnya,
        kasbon_opening: open.k,
        cicilan_opening: open.c,
        minggu: weeks, // index 0..4 = Minggu 1..5
        total_kasbon: totalKasbon,
        total_cicilan: totalCicilan,
        kasbon_dibayar: kasbonDibayar,
        cicilan_dibayar: cicilanDibayar,
        sisa_kasbon: totalKasbon - kasbonDibayar,
        sisa_cicilan: totalCicilan - cicilanDibayar,
      };
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    console.error("[kasbon-cicilan GET] exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Server error" }, { status: 500 });
  }
}

// Simpan / update saldo awal manual per karyawan
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!hasAccess(user)) return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });

    const body = await request.json();
    const { user_id, kasbon_opening, cicilan_opening } = body ?? {};
    if (!user_id) return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });

    const k = Math.round(Number(kasbon_opening ?? 0));
    const c = Math.round(Number(cicilan_opening ?? 0));
    if (!Number.isFinite(k) || !Number.isFinite(c) || k < 0 || c < 0) {
      return NextResponse.json({ success: false, message: "Nominal saldo awal tidak valid" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("kasbon_opening_balances")
      .upsert(
        { user_id, kasbon_opening: k, cicilan_opening: c, updated_by: user.id, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[kasbon-cicilan POST] exception:", err);
    return NextResponse.json({ success: false, message: err?.message ?? "Server error" }, { status: 500 });
  }
}