// Registry misi Solit Coins.
//
// Menambah misi role baru (rollout "per-role per step") = TAMBAH 1 entry di
// array QUESTS di bawah, reuse pola query dari milestone route / kerja-scoring.
// Angka poin SC dihitung TERPISAH TOTAL dari nilai poin Lencana meski sumber
// datanya sama — jangan reuse skor Lencana sebagai saldo SC.

import { createClient } from "@supabase/supabase-js";
import { toAttendanceDateKey } from "@/lib/auth";
import { dayWindow, weekWindow } from "@/lib/solit-coins/period";
import type { UserRole } from "@/lib/permissions";
import type { QuestPeriodType } from "@/lib/solit-coins/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface QuestCountCtx {
  userId: string;
  roles: string[];
  dayKey: string;
  weekKey: string;
}

export interface QuestDef {
  key: string;
  label: string;
  description: string;
  rewardSc: number;
  periodType: QuestPeriodType;
  target: number;
  /** "ALL" = semua role; atau daftar role yang berhak. */
  roles: "ALL" | UserRole[];
  /** Hitung progress real-time dari tabel operasional (read-only). */
  count: (ctx: QuestCountCtx) => Promise<number>;
}

// ── Helper hitung (dipakai varian harian & mingguan agar tidak duplikat) ─────

/** Unit servis selesai (DONE/SUDAH_DIAMBIL) oleh user dalam rentang [start,end]. */
async function countServicesDone(userId: string, start: string, end: string): Promise<number> {
  // ISO UTC (…Z) agar aman di dalam string filter .or (hindari '+' pada offset).
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const { count } = await supabase
    .from("service_orders")
    .select("id", { count: "exact", head: true })
    .eq("dikerjakan_by", userId)
    .is("alasan_tidak_jadi", null)
    .or(
      `and(status.eq.DONE,tanggal_selesai.gte.${startIso},tanggal_selesai.lte.${endIso}),` +
        `and(status.eq.SUDAH_DIAMBIL,tanggal_diambil.gte.${startIso},tanggal_diambil.lte.${endIso})`
    );
  return count ?? 0;
}

/** Transaksi LUNAS (status='PAID') oleh sales user dalam rentang [start,end]. */
async function countSalesPaid(userId: string, start: string, end: string): Promise<number> {
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("sales_id", userId)
    .eq("status", "PAID")
    .gte("created_at", start)
    .lte("created_at", end);
  return count ?? 0;
}

/** Konten ter-upload (cc_postings) oleh user dalam rentang [start,end]. */
async function countContentUploads(userId: string, start: string, end: string): Promise<number> {
  const { count } = await supabase
    .from("cc_postings")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .gte("created_at", start)
    .lte("created_at", end);
  return count ?? 0;
}

const TEKNISI_ROLES: UserRole[] = ["TEKNISI", "KEPALA_TEKNISI", "PKL_TEKNISI"];
const SALES_ROLES: UserRole[] = ["CREW_SALES", "KEPALA_SALES", "PKL_SALES"];
const PENYEDIA_ROLES: UserRole[] = ["PENYEDIA_BARANG", "KEPALA_PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG"];
const PENGANTARAN_ROLES: UserRole[] = ["PENGANTARAN", "PKL_PENGANTARAN"];
const KONTEN_ROLES: UserRole[] = ["KONTEN", "PKL_KONTEN"];

export const QUESTS: QuestDef[] = [
  // ── Misi universal (semua role) — aktif di infra v1 ──────────────────────
  {
    key: "absen_harian",
    label: "Absen masuk hari ini",
    description: "Absen masuk & wajah tercatat hari ini.",
    rewardSc: 10,
    periodType: "DAILY",
    target: 1,
    roles: "ALL",
    // Pola: src/app/api/auth/face-status/route.ts (baris ~93)
    count: async ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      const { count } = await supabase
        .from("face_verifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "SUCCESS")
        .eq("direction", "IN")
        .gte("created_at", start)
        .lte("created_at", end);
      return count ?? 0;
    },
  },
  {
    key: "streak_mingguan",
    label: "Streak 5 hari kerja tanpa telat",
    description: "Hadir tepat waktu (tanpa telat) di 5 hari kerja minggu ini.",
    rewardSc: 50,
    periodType: "WEEKLY",
    target: 5,
    roles: "ALL",
    // "Hadir tanpa telat" = late_weight === 0 pada baris IN (konsisten dgn
    // leaderboard/achievements). Hitung jumlah hari absensi unik yg on-time.
    count: async ({ userId, weekKey }) => {
      const { start, end } = weekWindow(weekKey);
      const { data } = await supabase
        .from("face_verifications")
        .select("created_at, late_weight")
        .eq("user_id", userId)
        .eq("status", "SUCCESS")
        .eq("direction", "IN")
        .gte("created_at", start)
        .lte("created_at", end);
      const onTimeDays = new Set<string>();
      for (const r of data ?? []) {
        if (((r as { late_weight: number | null }).late_weight ?? 0) === 0) {
          onTimeDays.add(toAttendanceDateKey((r as { created_at: string }).created_at));
        }
      }
      return onTimeDays.size;
    },
  },

  // ── Misi per-role (rollout bertahap) ─────────────────────────────────────
  // Step 2: Teknisi & Accounting/Purchasing (data paling siap).
  {
    key: "teknisi_harian",
    label: "Selesaikan 2 unit servis hari ini",
    description: "2 unit servis selesai (DONE / sudah diambil) hari ini.",
    rewardSc: 20,
    periodType: "DAILY",
    target: 2,
    roles: TEKNISI_ROLES,
    // Selesai = tanggal_diambil (SUDAH_DIAMBIL) / tanggal_selesai (DONE) dalam
    // window hari ini; alasan_tidak_jadi NULL = bukan servis batal.
    count: ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      return countServicesDone(userId, start, end);
    },
  },
  {
    key: "accounting_harian",
    label: "Input 5 data cashflow manual hari ini",
    description: "Catat minimal 5 entri cashflow manual hari ini.",
    rewardSc: 15,
    periodType: "DAILY",
    target: 5,
    roles: [
      "ACCOUNTING",
      "PURCHASING",
      "PENGELOLA_BARANG",
      "KEPALA_PENGELOLA_BARANG",
      "PKL_ACCOUNTING",
      "PKL_PENGELOLA_BARANG",
    ],
    // Pola: kerja-scoring.ts (cashflow_entries source_type='MANUAL', created_by).
    count: async ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      const { count } = await supabase
        .from("cashflow_entries")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)
        .eq("source_type", "MANUAL")
        .gte("created_at", start)
        .lte("created_at", end);
      return count ?? 0;
    },
  },

  // Step 3: Sales harian.
  {
    key: "sales_harian",
    label: "3 transaksi lunas hari ini",
    description: "Tuntaskan 3 transaksi berstatus LUNAS hari ini.",
    rewardSc: 15,
    periodType: "DAILY",
    target: 3,
    roles: SALES_ROLES,
    // Pola: kerja-scoring.ts / sales-milestones (transactions status='PAID', sales_id).
    count: ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      return countSalesPaid(userId, start, end);
    },
  },

  // ── Misi mingguan per-role ───────────────────────────────────────────────
  {
    key: "sales_mingguan",
    label: "15 transaksi lunas minggu ini",
    description: "Kumpulkan 15 transaksi LUNAS sepanjang minggu ini.",
    rewardSc: 75,
    periodType: "WEEKLY",
    target: 15,
    roles: SALES_ROLES,
    count: ({ userId, weekKey }) => {
      const { start, end } = weekWindow(weekKey);
      return countSalesPaid(userId, start, end);
    },
  },
  {
    key: "teknisi_mingguan",
    label: "10 unit servis minggu ini",
    description: "Selesaikan 10 unit servis sepanjang minggu ini.",
    rewardSc: 100,
    periodType: "WEEKLY",
    target: 10,
    roles: TEKNISI_ROLES,
    count: ({ userId, weekKey }) => {
      const { start, end } = weekWindow(weekKey);
      return countServicesDone(userId, start, end);
    },
  },

  // Step 4: Penyedia Barang, Pengantaran, Konten, Programmer.
  {
    key: "penyedia_harian",
    label: "Siapkan 5 unit hari ini",
    description: "5 unit barang selesai disiapkan hari ini.",
    rewardSc: 15,
    periodType: "DAILY",
    target: 5,
    roles: PENYEDIA_ROLES,
    // 1 "unit" = 1 preparation_items non-cancelled pada order yang di-done user
    // hari ini (bukan 1 order). Pola: kerja-scoring.ts / provider-milestones.
    count: async ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      const { data } = await supabase
        .from("preparation_orders")
        .select("id, preparation_items(id, is_cancelled)")
        .eq("done_by", userId)
        .not("done_at", "is", null)
        .gte("done_at", start)
        .lte("done_at", end);
      let units = 0;
      for (const o of (data ?? []) as { preparation_items?: { is_cancelled: boolean }[] }[]) {
        units += (o.preparation_items ?? []).filter((it) => !it.is_cancelled).length;
      }
      return units;
    },
  },
  {
    key: "pengantaran_harian",
    label: "Selesaikan pengantaran hari ini",
    description: "Tuntaskan minimal 1 pengantaran hari ini.",
    rewardSc: 15,
    periodType: "DAILY",
    target: 1,
    roles: PENGANTARAN_ROLES,
    // Pola: delivery-milestones (delivery_method='PENGANTARAN', status='SELESAI').
    count: async ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      const { count } = await supabase
        .from("preparation_orders")
        .select("id", { count: "exact", head: true })
        .eq("delivery_user_id", userId)
        .eq("delivery_method", "PENGANTARAN")
        .eq("status", "SELESAI")
        .not("delivered_at", "is", null)
        .gte("delivered_at", start)
        .lte("delivered_at", end);
      return count ?? 0;
    },
  },
  {
    key: "konten_harian",
    label: "Upload 1 konten hari ini",
    description: "Selesaikan upload minimal 1 konten hari ini.",
    rewardSc: 20,
    periodType: "DAILY",
    target: 1,
    roles: KONTEN_ROLES,
    // "Upload" = 1 row cc_postings. Pola: kerja-scoring.ts (metrik Upload).
    count: ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      return countContentUploads(userId, start, end);
    },
  },
  {
    key: "konten_mingguan",
    label: "Upload 5 konten minggu ini",
    description: "Kumpulkan 5 konten ter-upload sepanjang minggu ini.",
    rewardSc: 100,
    periodType: "WEEKLY",
    target: 5,
    roles: KONTEN_ROLES,
    count: ({ userId, weekKey }) => {
      const { start, end } = weekWindow(weekKey);
      return countContentUploads(userId, start, end);
    },
  },
  {
    key: "programmer_harian",
    label: "Selesaikan 2 to-do hari ini",
    description: "Tandai 2 to-do sebagai Done hari ini.",
    rewardSc: 20,
    periodType: "DAILY",
    target: 2,
    roles: ["PROGRAMMER"],
    // to-do sub-task selesai (todo_items.completed_by/completed_at). Pola:
    // kerja-scoring.ts (blok todos) + api/todos/[id]/items.
    count: async ({ userId, dayKey }) => {
      const { start, end } = dayWindow(dayKey);
      const { count } = await supabase
        .from("todo_items")
        .select("id", { count: "exact", head: true })
        .eq("completed_by", userId)
        .not("completed_at", "is", null)
        .gte("completed_at", start)
        .lte("completed_at", end);
      return count ?? 0;
    },
  },

  // Opsional (belum): kepala_acc_harian — ACC 1 pengajuan (lembur/kendaraan).
  // Ditunda: approval kendaraan ada di Supabase project terpisah & perlu
  // verifikasi daftar role approver dulu (lihat spek §6 "opsional").
];

/** Apakah quest berlaku untuk user dengan roles ini. */
export function questApplies(def: QuestDef, userRoles: string[]): boolean {
  if (def.roles === "ALL") return true;
  return def.roles.some((r) => userRoles.includes(r));
}

/** period_key aktif untuk sebuah quest. */
export function periodKeyFor(def: QuestDef, dayKey: string, weekKey: string): string {
  return def.periodType === "DAILY" ? dayKey : weekKey;
}

export function getQuestByKey(key: string): QuestDef | undefined {
  return QUESTS.find((q) => q.key === key);
}
