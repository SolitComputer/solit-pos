// src/lib/violation-points.ts
//
// Perhitungan "poin akhir" untuk tab Pelanggaran di halaman Lencana.
// Keputusan bisnis yang dikunci:
//  - base = quality_pct (Absensi) + score (Pekerjaan) pada bulan ybs.
//  - poin pelanggaran = SUM(points_deducted) baris violation_penalties yg
//    masih active di bulan ybs.
//  - net = base − poin pelanggaran. BOLEH minus, ditampilkan apa adanya.
//  - Level tab ini dihitung dari peringkat NET gabungan per bulan (Top 3 =
//    qualifies) via computeBadgeLevel yang sama dgn lencana lain → pelanggaran
//    menekan kenaikan level bulan berjalan, TAPI level permanen (streak 3+
//    bulan) tidak dicabut (ditangani computeBadgeLevel).
//
// Catatan performa: tabel attendance_quality_scores & leaderboard_kerja_scores
// berisi 1 baris/user/bulan (kecil), jadi aman ditarik penuh untuk menyusun
// riwayat peringkat net antar-bulan. .limit(10000) sengaja dipasang supaya
// tidak kena default cap PostgREST (biasanya 1000) saat data makin banyak.

import { supabaseAdmin } from "@/services/supabaseAdmin";
import { computeBadgeLevel, HistRow } from "@/lib/badge-level";

export type NetBoardRow = {
  user_id: string;
  name: string;
  role: string;
  quality_pct: number;      // komponen Absensi
  kerja_score: number;      // komponen Pekerjaan
  base_points: number;      // quality_pct + kerja_score
  violation_points: number; // total potongan aktif bulan ini
  net_points: number;       // base − violation (boleh minus)
  rank: number;             // peringkat berdasar net (desc)
  level: number;
  isPermanent: boolean;
  isTemporary: boolean;
  streakMonths: number;
};

type Cell = { q: number; s: number; pen: number };
const monthKey = (y: number, m: number) => `${y}-${m}`;

export async function getViolationNetBoard(
  year: number,
  month: number
): Promise<NetBoardRow[]> {
  const [absRes, kerjaRes, penRes] = await Promise.all([
    supabaseAdmin.from("attendance_quality_scores")
      .select("user_id, year, month, quality_pct").limit(10000),
    supabaseAdmin.from("leaderboard_kerja_scores")
      .select("user_id, year, month, score").limit(10000),
    supabaseAdmin.from("violation_penalties")
      .select("user_id, year, month, points_deducted").eq("active", true).limit(10000),
  ]);

  const buckets = new Map<string, { year: number; month: number; cells: Map<string, Cell> }>();
  const cellOf = (y: number, m: number, uid: string): Cell => {
    const k = monthKey(y, m);
    if (!buckets.has(k)) buckets.set(k, { year: y, month: m, cells: new Map() });
    const b = buckets.get(k)!;
    if (!b.cells.has(uid)) b.cells.set(uid, { q: 0, s: 0, pen: 0 });
    return b.cells.get(uid)!;
  };

  for (const r of absRes.data ?? []) cellOf(r.year, r.month, r.user_id).q = Number(r.quality_pct) || 0;
  for (const r of kerjaRes.data ?? []) cellOf(r.year, r.month, r.user_id).s = Number(r.score) || 0;
  for (const r of penRes.data ?? []) cellOf(r.year, r.month, r.user_id).pen += Number(r.points_deducted) || 0;

  // Riwayat peringkat net per user (semua bulan, kronologis) → dasar level.
  const historyByUser = new Map<string, HistRow[]>();
  const monthsAsc = [...buckets.values()].sort(
    (a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month)
  );
  for (const mo of monthsAsc) {
    const ranked = [...mo.cells.entries()]
      .map(([uid, c]) => ({ uid, net: c.q + c.s - c.pen }))
      .sort((a, b) => b.net - a.net);
    ranked.forEach((r, i) => {
      if (!historyByUser.has(r.uid)) historyByUser.set(r.uid, []);
      historyByUser.get(r.uid)!.push({ year: mo.year, month: mo.month, rank: i + 1 });
    });
  }

  const target = buckets.get(monthKey(year, month));
  if (!target || target.cells.size === 0) return [];

  const rows = [...target.cells.entries()]
    .map(([uid, c]) => ({
      user_id: uid,
      quality_pct: c.q,
      kerja_score: c.s,
      violation_points: c.pen,
      base_points: c.q + c.s,
      net_points: c.q + c.s - c.pen,
    }))
    .sort((a, b) => b.net_points - a.net_points);

  const ids = rows.map((r) => r.user_id);
  const { data: users } = await supabaseAdmin
    .from("users").select("id, name, role")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  return rows.map((r, i) => {
    const lvl = computeBadgeLevel(historyByUser.get(r.user_id) ?? []);
    return {
      ...r,
      rank: i + 1,
      name: userMap.get(r.user_id)?.name ?? "Unknown",
      role: userMap.get(r.user_id)?.role ?? "",
      level: lvl.displayLevel,
      isPermanent: lvl.isPermanent,
      isTemporary: lvl.isTemporary,
      streakMonths: lvl.currentStreak,
    };
  });
}

// Poin per kategori (Sangat Berat = PHK, bukan potong poin).
export const VIOLATION_POINTS: Record<string, number> = {
  RINGAN: 1,
  SEDANG: 5,
  BERAT: 10,
};

// "Ketahuan diam-diam belakangan" → naik 1 tingkat. Di-cap di BERAT supaya
// tidak otomatis loncat ke PHK (SANGAT_BERAT wajib keputusan manual).
export function bumpSeverity(sev: string): string {
  if (sev === "RINGAN") return "SEDANG";
  if (sev === "SEDANG") return "BERAT";
  return "BERAT";
}