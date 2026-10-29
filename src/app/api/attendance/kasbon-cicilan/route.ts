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

// ⬅️ BARU — Entry cashflow KASBON/CICILAN SEBELUM tanggal ini tidak ditarik
// otomatis ke tabel (data lama + testing jadi kosong). Transaksi pada/sesudah
// tanggal ini tetap otomatis masuk seperti biasa.
const AUTO_SYNC_CUTOFF = "2026-10-17"; // YYYY-MM-DD (WIB)

function getRoles(user: any): string[] {
  return Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : user?.role ? [user.role] : [];
}

// ⬅️ BARU — deteksi role PKL (samakan dgn isPKLRole di page.tsx: "PKL" / "PKL_*" / "PKL-*")
function isPKLRole(role?: string): boolean {
  if (!role) return false;
  return role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-");
}
function hasAccess(user: any): boolean {
  return getRoles(user).some((r) => KASBON_ACCESS_ROLES.includes(r));
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const canViewAll = hasAccess(user);

    // ⬅️ REVISI — role PKL TIDAK punya akses Kasbon & Cicilan sama sekali
    // (kecuali dia juga punya role full-access KASBON_ACCESS_ROLES). Ditolak di
    // server supaya tidak bisa diakses lewat URL langsung.
    const userHasPKLRole = getRoles(user).some((r) => isPKLRole(r));
    if (!canViewAll && userHasPKLRole) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }
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

    // Tab ini hanya menampilkan KARYAWAN — role PKL di-exclude.
    const { data: usersRaw, error: uErr } = await supabase
      .from("users")
      .select("id, name, role")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (uErr) return NextResponse.json({ success: false, message: uErr.message }, { status: 500 });

    // ⬅️ BARU — non-full-access hanya melihat barisnya sendiri. PKL tetap
    // di-exclude untuk full-access; untuk user sendiri, baris dirinya tetap
    // ditampilkan walau dia PKL (biar dia tetap bisa lihat kasbon/cicilannya).
    const users = canViewAll
      ? (usersRaw ?? []).filter((u: any) => !isPKLRole(u.role))
      : (usersRaw ?? []).filter((u: any) => u.id === user.id);

    // Saldo awal manual — HANYA yang di-set pada/sesudah cutoff auto-sync.
    // Opening balance lama (sebelum cutoff) sengaja diabaikan supaya tabel
    // mulai bersih; admin isi ulang manual lewat tombol "Atur".
    const { data: openings } = await supabase
      .from("kasbon_opening_balances")
      .select("user_id, kasbon_opening, cicilan_opening, updated_at");
    const openMap: Record<string, { k: number; c: number }> = {};
    (openings ?? []).forEach((o: any) => {
      const updatedAt = String(o.updated_at ?? "").slice(0, 10); // YYYY-MM-DD
      if (updatedAt && updatedAt < AUTO_SYNC_CUTOFF) return; // ⬅️ opening lama diabaikan
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
      if (tgl < AUTO_SYNC_CUTOFF) continue; // ⬅️ BARU — entry lama (termasuk testing) tidak dihitung
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

    // ── Pelunasan via POTONG GAJI (Rekap Gaji → Tunjangan) ──
    // deduction_loan = potong Kasbon, deduction_cicilan = potong Cicilan.
    // Diperlakukan sama seperti pembayaran (IN): bulan ini → "Dibayar",
    // bulan sebelumnya → ikut mengurangi saldo "Sebelumnya" (carryover).
    const validUserIds = new Set((users ?? []).map((u: any) => u.id));
    const viewIdx = year * 12 + (month - 1);
    // ⬅️ BARU — index bulan cutoff (mis. 2026-10 → 2026*12 + 9). Potongan gaji
    // sebelum bulan ini tidak ikut dihitung, biar carryover mulai bersih.
    const cutoffYear = parseInt(AUTO_SYNC_CUTOFF.slice(0, 4), 10);
    const cutoffMonth = parseInt(AUTO_SYNC_CUTOFF.slice(5, 7), 10); // 1..12
    const cutoffIdx = cutoffYear * 12 + (cutoffMonth - 1);
    const { data: allowRows } = await supabase
      .from("user_allowances")
      .select("user_id, year, month, deduction_loan, deduction_cicilan");
    (allowRows ?? []).forEach((r: any) => {
      const uid = r.user_id as string;
      if (!uid || !validUserIds.has(uid)) return;
      const aYear = Number(r.year);
      const aMonth = Number(r.month); // 1..12
      if (!Number.isFinite(aYear) || !Number.isFinite(aMonth)) return;
      const kasbon = Math.max(0, Math.round(Number(r.deduction_loan ?? 0)));
      const cicilan = Math.max(0, Math.round(Number(r.deduction_cicilan ?? 0)));
      if (kasbon === 0 && cicilan === 0) return;
      const aIdx = aYear * 12 + (aMonth - 1);
      if (aIdx > viewIdx) return; // potongan bulan depan → diabaikan
      if (aIdx < cutoffIdx) return; // ⬅️ BARU — potongan sebelum cutoff tidak dihitung
      const a = ensure(uid);
      if (aIdx < viewIdx) {
        a.priorKasbonIn += kasbon;   // potongan bulan lalu → kurangi "Kasbon Sebelumnya"
        a.priorCicilanIn += cicilan; // potongan bulan lalu → kurangi "Cicilan Sebelumnya"
      } else {
        a.kasbonDibayar += kasbon;   // potongan bulan ini → "Kasbon Dibayar"
        a.cicilanDibayar += cicilan; // potongan bulan ini → "Cicilan Dibayar"
      }
    });

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