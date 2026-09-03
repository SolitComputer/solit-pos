import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const dynamic = "force-dynamic";

interface TeknisiUserRow {
  id: string;
  name: string;
  role: string;
}

// ✅ Lencana Teknisi — pola sama persis dengan Lencana Penyedia Barang & Sales:
// MILESTONE kumulatif ALL-TIME (bukan level/streak bulanan), TIDAK dibatasi
// Top 3. Satuan yang dihitung: total unit laptop SERVIS yang BERHASIL
// diselesaikan teknisi tsb (`dikerjakan_by` di tabel `service_orders`).
//
// ASUMSI kriteria "berhasil diselesaikan" (koreksi kalau salah):
// status harus DONE atau SUDAH_DIAMBIL (pekerjaan sudah kelar, entah sudah
// diambil pelanggan atau belum) DAN `alasan_tidak_jadi` harus KOSONG — kolom
// ini terisi baik untuk order GAGAL_DIPERBAIKI maupun TIDAK_JADI (lihat
// api/service/[id]/route.ts), dan tetap terisi walau order itu akhirnya
// pindah ke SUDAH_DIAMBIL (customer tetap ambil laptopnya meski gagal
// diperbaiki) — jadi tanpa syarat ini, servis yang GAGAL malah ikut kehitung.
// ✅ FIX — `SERVICE_TEKNISI_ROLES` di lib/permissions.ts adalah daftar role
// yang BOLEH mengoperasikan alur servis (termasuk ADMIN/PROGRAMMER untuk
// keperluan override), bukan daftar "siapa yang benar-benar berprofesi
// Teknisi". Untuk leaderboard Lencana ini kita cuma mau tampilkan akun yang
// identitas role-nya betulan Teknisi/PKL Teknisi — pakai daftar sendiri di
// sini, bukan reuse SERVICE_TEKNISI_ROLES.
const TEKNISI_IDENTITY_ROLES = ["TEKNISI", "PKL_TEKNISI"];

const MILESTONES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

function highestMilestone(total: number): number {
  let tier = 0;
  for (const m of MILESTONES) {
    if (total >= m) tier = m;
  }
  return tier;
}

const PAGE_SIZE = 1000; // batas bawaan Supabase per query — dipaginasi

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const supabase = getAdmin();

    // 1) Semua akun dengan role Teknisi (identitas asli, bukan role yang
    //    sekadar punya izin akses servis)
    const { data: teknisiUsers, error: userErr } = await supabase
      .from("users")
      .select("id, name, role")
      .in("role", TEKNISI_IDENTITY_ROLES);
    if (userErr) throw userErr;
    const teknisi = (teknisiUsers ?? []) as TeknisiUserRow[];

    // 2) Semua service_orders yang BERHASIL diselesaikan (DONE/SUDAH_DIAMBIL,
    //    tanpa alasan_tidak_jadi), dipaginasi karena Supabase membatasi 1000
    //    baris per query.
    const totalByTeknisi = new Map<string, number>();
    {
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("service_orders")
          .select("dikerjakan_by")
          .in("status", ["DONE", "SUDAH_DIAMBIL"])
          .is("alasan_tidak_jadi", null)
          .not("dikerjakan_by", "is", null)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((o: any) => {
          totalByTeknisi.set(o.dikerjakan_by, (totalByTeknisi.get(o.dikerjakan_by) ?? 0) + 1);
        });
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // 3) Susun & ranking — SEMUA teknisi dimunculkan walau total = 0, biar
    //    konsisten dengan pola Absensi/Pekerjaan/Penyedia Barang
    const ranked = teknisi
      .map((t) => {
        const total = totalByTeknisi.get(t.id) ?? 0;
        return { user_id: t.id, name: t.name, role: t.role, total, milestone: highestMilestone(total) };
      })
      .sort((a, b) => b.total - a.total)
      .map((row, i) => ({ ...row, rank: i + 1 }));

    if (searchParams.get("list") === "true") {
      return NextResponse.json({ success: true, data: ranked });
    }

    const targetUserId = searchParams.get("userId") || user.id;
    const mine = ranked.find((r) => r.user_id === targetUserId) ?? null;

    return NextResponse.json({
      success: true,
      data: mine
        ? {
            total: mine.total,
            rank: mine.rank,
            totalRanked: ranked.length,
            milestone: mine.milestone,
            hasBadge: mine.milestone > 0,
          }
        : null,
    });
  } catch (err: any) {
    console.error("[GET /api/service/teknisi-milestones]", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Gagal mengambil data lencana teknisi" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);