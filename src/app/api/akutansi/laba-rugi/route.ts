// src/app/api/akutansi/laba-rugi/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  LABA_RUGI_GROUP_NORMAL,
  LabaRugiGroup,
  isValidPeriod,
  labaPeriodAccountName,
  labaRugiGroup,
  normalizeAccountName,
} from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface AccountRow {
  code: string;
  name: string;
  type: string;
}
interface LabaRugiRow {
  code: string;
  name: string;
  nominal: number;
}

// Supabase .in() punya batas panjang URL — dipecah supaya aman kalau
// entry jurnal sudah ribuan.
const CHUNK = 500;

export const GET = withAuth(async (req) => {
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  try {
    // ── 1) Semua akun (dari DB, jadi akun custom ikut) ──
    const { data: accountsData, error: accErr } = await supabase
      .from("chart_of_accounts")
      .select("code, name, type")
      .order("code", { ascending: true });
    if (accErr) throw accErr;
    const accounts = (accountsData ?? []) as AccountRow[];

    // ── 2) Entry s/d periode ini, sekalian tandai mana yang periode berjalan ──
    const { data: entries, error: entryErr } = await supabase
      .from("journal_entries")
      .select("id, period")
      .lte("period", period);
    if (entryErr) throw entryErr;

    const allIds: string[] = [];
    const currentIds = new Set<string>();
    for (const e of (entries ?? []) as { id: string; period: string }[]) {
      allIds.push(e.id);
      if (e.period === period) currentIds.add(e.id);
    }

    // ── 3) Agregasi journal_lines ──
    //  mutasiPeriode  = HANYA periode berjalan  -> dipakai Pendapatan & Beban
    //  mutasiKumulatif = s/d periode ini        -> dipakai akun Laba (ditahan)
    const mutasiPeriode = new Map<string, number>();
    const mutasiKumulatif = new Map<string, number>();

    for (let i = 0; i < allIds.length; i += CHUNK) {
      const chunk = allIds.slice(i, i + CHUNK);
      const { data: lines, error: lineErr } = await supabase
        .from("journal_lines")
        .select("entry_id, account_code, side, nominal")
        .in("entry_id", chunk);
      if (lineErr) throw lineErr;

      for (const l of (lines ?? []) as any[]) {
        const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
        const code = l.account_code as string;
        mutasiKumulatif.set(code, (mutasiKumulatif.get(code) ?? 0) + signed);
        if (currentIds.has(l.entry_id)) {
          mutasiPeriode.set(code, (mutasiPeriode.get(code) ?? 0) + signed);
        }
      }
    }

    // ── 4) Saldo awal manual — HANYA memengaruhi saldo kumulatif (laba ditahan),
    //       bukan mutasi periode berjalan (saldo awal bukan transaksi bulan ini).
    const { data: openings, error: openErr } = await supabase
      .from("journal_opening_balances")
      .select("account_code, side, nominal");
    if (openErr) throw openErr;

    for (const o of (openings ?? []) as any[]) {
      const signed = o.side === "DEBIT" ? Number(o.nominal) : -Number(o.nominal);
      mutasiKumulatif.set(o.account_code, (mutasiKumulatif.get(o.account_code) ?? 0) + signed);
    }

    // ── 5) Kelompokkan per grup laporan ──
    const groups: Record<LabaRugiGroup, LabaRugiRow[]> = {
      PENDAPATAN: [],
      MODAL_KELUAR: [],
      OPERASIONAL: [],
      LUAR_OPERASIONAL: [],
      LABA_DITAHAN: [],
    };

    const currentLabaName = normalizeAccountName(labaPeriodAccountName(period));
    let akunLabaPeriode: LabaRugiRow | null = null;

    for (const acc of accounts) {
      const group = labaRugiGroup(acc);
      if (!group) continue;

      const isLabaGroup = group === "LABA_DITAHAN";
      const signed = isLabaGroup
        ? mutasiKumulatif.get(acc.code) ?? 0
        : mutasiPeriode.get(acc.code) ?? 0;

      // Saldo bertanda -> angka laporan (selalu positif kalau posisinya wajar)
      const nominal = LABA_RUGI_GROUP_NORMAL[group] === "DEBIT" ? signed : -signed;

      // Akun "Laba <periode ini>" TIDAK ikut laba ditahan — dia hasil closing
      // periode ini, dipakai cuma buat verifikasi (kalau ikut = dobel hitung).
      if (isLabaGroup && normalizeAccountName(acc.name) === currentLabaName) {
        akunLabaPeriode = { code: acc.code, name: acc.name, nominal };
        continue;
      }

      // Akun laba bulan-bulan lama jumlahnya nambah terus — yang saldonya 0 dibuang
      // supaya tabel tidak penuh baris kosong. Grup lain tetap ditampilkan walau 0
      // (mengikuti format laporan Excel).
      if (isLabaGroup && Math.round(nominal) === 0) continue;

      groups[group].push({ code: acc.code, name: acc.name, nominal });
    }

    const byCode = (a: LabaRugiRow, b: LabaRugiRow) => {
      const na = parseInt(a.code, 10);
      const nb = parseInt(b.code, 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.code.localeCompare(b.code);
    };
    (Object.keys(groups) as LabaRugiGroup[]).forEach((g) => groups[g].sort(byCode));

    // ── 6) Total ──
    const sum = (rows: LabaRugiRow[]) => rows.reduce((s, r) => s + r.nominal, 0);

    const totalPendapatan = sum(groups.PENDAPATAN);
    const totalModalKeluar = sum(groups.MODAL_KELUAR);
    const totalOperasional = sum(groups.OPERASIONAL);
    const totalLuarOperasional = sum(groups.LUAR_OPERASIONAL);
    const totalLabaDitahan = sum(groups.LABA_DITAHAN);

    const labaOperasional =
      totalPendapatan - totalModalKeluar - totalOperasional - totalLuarOperasional;
    const totalLaba = labaOperasional + totalLabaDitahan;

    const selisihVerifikasi = akunLabaPeriode ? akunLabaPeriode.nominal - totalLaba : null;

    return NextResponse.json({
      success: true,
      data: {
        period,
        pendapatan: { rows: groups.PENDAPATAN, total: totalPendapatan },
        modal_keluar: { rows: groups.MODAL_KELUAR, total: totalModalKeluar },
        operasional: { rows: groups.OPERASIONAL, total: totalOperasional },
        luar_operasional: { rows: groups.LUAR_OPERASIONAL, total: totalLuarOperasional },
        laba_ditahan: { rows: groups.LABA_DITAHAN, total: totalLabaDitahan },
        laba_operasional: labaOperasional,
        total_laba: totalLaba,
        akun_laba_periode: akunLabaPeriode,
        selisih_verifikasi: selisihVerifikasi,
      },
    });
  } catch (error: any) {
    console.error("[laba-rugi GET]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal memuat laba rugi" },
      { status: 500 }
    );
  }
}, AKUNTANSI_ROLES);