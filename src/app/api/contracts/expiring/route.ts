import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { CONTRACT_EXPIRING_VIEW_ROLES } from "@/lib/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Jendela badge sidebar (?count=1) — tetap H-7 biar angka notif tetap "urgent".
const WARNING_WINDOW_DAYS = 7;
// Jendela halaman Daftar Kontrak — lebih lebar supaya 3 kelompok terisi.
const LIST_WINDOW_DAYS = 365;

// ── Nama kolom "Kenaikan Jenjang" di tabel `users` ────────────────────────────
// ⚠️ GANTI di sini kalau nama kolom di Supabase-mu berbeda:
const COL_NEXT_LEVEL = "next_career_level";        // SELANJUTNYA (level tujuan)
const COL_KONTRAK_PREV = "contract_duration";      // KONTRAK SEBELUMNYA
const COL_KONTRAK_NEXT = "next_contract_duration"; // KONTRAK SELANJUTNYA

// Durasi kontrak (bulan): dari tanggal TANDA TANGAN karyawan → tanggal BERAKHIR.
// Pakai rata-rata 30,4375 hari/bulan + pembulatan, minimum 1 bulan — supaya TTD
// yang telat beberapa hari tidak bikin "1 bulan" terlanjur dibulatkan jadi 0.
function contractDurationMonths(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const days = (end - start) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(days / 30.4375));
}

function canView(user: AuthUser): boolean {
  const roles = user.roles?.length ? user.roles : [user.role];
  return roles.some((r) => (CONTRACT_EXPIRING_VIEW_ROLES as string[]).includes(r));
}

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  if (!canView(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const countOnly = searchParams.get("count") === "1";

  // Hitung tanggal berbasis WIB (UTC+7) — konsisten dengan /api/contracts/me.
  const nowWIBms = Date.now() + 7 * 60 * 60 * 1000;
  const todayWIB = new Date(nowWIBms).toISOString().slice(0, 10);

  // count=1 (badge) pakai 7 hari; halaman daftar pakai 30 hari.
  const windowDays = countOnly ? WARNING_WINDOW_DAYS : LIST_WINDOW_DAYS;
  const boundaryWIB = new Date(nowWIBms + windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("users")
    .select(
      `id, name, role, career_level, contract_valid_until, active_contract_id, ${COL_NEXT_LEVEL}, ${COL_KONTRAK_PREV}, ${COL_KONTRAK_NEXT}`
    )
    .eq("contract_status", "APPROVED")
    .not("contract_valid_until", "is", null)
    .gte("contract_valid_until", todayWIB)      // dari hari ini (days_left >= 0)
    .lte("contract_valid_until", boundaryWIB)   // sampai batas window (7 atau 30 hari)
    .order("contract_valid_until", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Ambil tanggal TTD + berakhir dari kontrak aktif tiap karyawan, dipakai untuk
  // menghitung durasi kolom "Kontrak Sebelumnya". Hanya untuk halaman daftar —
  // path badge (?count=1) tidak perlu data ini, jadi di-skip biar query ringan.
  const signedMap = new Map<
    string,
    { signedAt: string | null; validFrom: string | null; validUntil: string | null }
  >();
  if (!countOnly) {
    const contractIds = Array.from(
      new Set((data ?? []).map((u: any) => u.active_contract_id).filter(Boolean) as string[])
    );
    if (contractIds.length > 0) {
      const { data: contractRows } = await supabase
        .from("user_contracts")
        .select("id, user_signed_at, responded_at, valid_from, valid_until")
        .in("id", contractIds);
      for (const c of contractRows ?? []) {
        signedMap.set(c.id, {
          signedAt: c.user_signed_at ?? c.responded_at ?? null,
          validFrom: c.valid_from ?? null,
          validUntil: c.valid_until ?? null,
        });
      }
    }
  }

  const todayMs = new Date(todayWIB).getTime();
  const rows = (data ?? []).map((u: any) => {
    const diffMs = new Date(u.contract_valid_until).getTime() - todayMs;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Durasi kontrak berjalan: dari tanda tangan → berlaku sampai (dalam bulan).
    const info = u.active_contract_id ? signedMap.get(u.active_contract_id) : undefined;
    const startRef = info?.signedAt ?? info?.validFrom ?? null;
    const endRef = info?.validUntil ?? u.contract_valid_until ?? null;
    const durationMonths = contractDurationMonths(startRef, endRef);

    return {
      id: u.id,
      name: u.name,
      role: u.role,
      career_level: u.career_level,
      contract_valid_until: u.contract_valid_until,
      days_left: daysLeft,
      next_career_level: u[COL_NEXT_LEVEL] ?? null,
      contract_duration: u[COL_KONTRAK_PREV] ?? null,
      contract_duration_months: durationMonths,
      next_contract_duration: u[COL_KONTRAK_NEXT] ?? null,
    };
  });

  // Mode ringan untuk badge sidebar — cuma butuh angka, nggak perlu list penuh.
  if (countOnly) {
    return NextResponse.json({ success: true, count: rows.length });
  }

  return NextResponse.json({
    success: true,
    data: rows,
    count: rows.length,
    window_days: windowDays,
  });
}

export const GET = withAuth(getHandler);