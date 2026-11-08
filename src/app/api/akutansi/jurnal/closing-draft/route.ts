// src/app/api/akutansi/jurnal/closing-draft/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNTS,
  isValidPeriod,
  labaRugiGroup,
  normalizeAccountName,
  periodLabel,
} from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Hari terakhir bulan "YYYY-MM" → "YYYY-MM-DD"
function lastDayOfPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // day 0 bulan berikut = tgl terakhir bulan ini
  return `${period}-${String(lastDay).padStart(2, "0")}`;
}

// GET /api/akutansi/jurnal/closing-draft?period=YYYY-MM
// Menghitung DRAFT jurnal penutup otomatis (TIDAK menyimpan apa pun):
// tarik saldo berjalan tiap akun NOMINAL (Pendapatan 410–439, Modal Keluar/HPP
// 440–499, Operasional 500–529, Di Luar Operasional 530–599) s/d & termasuk
// periode ini — PERSIS saldo akhir akun di Buku Besar/Neraca. SEMUA entry ikut
// (termasuk jurnal penutup lama), jadi akun yang sudah ter-nol otomatis
// terlewati → tidak ditutup dobel. Lalu rakit baris penutup + 1 baris selisih
// ke akun Laba.
export const GET = withAuth(async (req) => {
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  try {
    // 1) Saldo bertanda tiap akun (DEBIT=+, KREDIT=−) dari SEMUA jurnal s/d periode ini.
    const balanceMap = new Map<string, number>();
    {
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error } = await supabase
          .from("journal_lines")
          .select("account_code, side, nominal, journal_entries!inner(period)")
          .lte("journal_entries.period", period)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!page || page.length === 0) break;
        for (const l of page as any[]) {
          const signed = l.side === "DEBIT" ? Number(l.nominal) : -Number(l.nominal);
          balanceMap.set(l.account_code, (balanceMap.get(l.account_code) ?? 0) + signed);
        }
        from += page.length; // maju sesuai baris diterima (hindari putus dini saat db-max-rows)
      }
    }

    // 2) Nama + tipe akun (gabung chart_of_accounts + ACCOUNTS statis).
    const { data: dbAccounts, error: accErr } = await supabase
      .from("chart_of_accounts")
      .select("code, name, type");
    if (accErr) throw accErr;

    const accMap = new Map<string, { code: string; name: string; type: string }>();
    for (const a of ACCOUNTS) accMap.set(a.code, { code: a.code, name: a.name, type: a.type });
    for (const a of (dbAccounts ?? []) as any[]) accMap.set(a.code, { code: a.code, name: a.name, type: a.type });

    // 3) Rakit baris penutup tiap akun NOMINAL yang saldonya ≠ 0.
    const lines: { account_code: string; account_name: string; side: "DEBIT" | "KREDIT"; nominal: number }[] = [];
    for (const [code, signed] of balanceMap.entries()) {
      const bal = Math.round(signed);
      if (bal === 0) continue;
      const acc = accMap.get(code) ?? { code, name: code, type: "" };
      const group = labaRugiGroup({ code, name: acc.name, type: acc.type });
      if (!group || group === "LABA_DITAHAN") continue; // hanya akun nominal yang ditutup

      // Saldo di sisi KREDIT (signed<0) → tutup dengan DEBIT; sisi DEBIT → tutup dengan KREDIT.
      const side: "DEBIT" | "KREDIT" = signed < 0 ? "DEBIT" : "KREDIT";
      lines.push({ account_code: code, account_name: acc.name, side, nominal: Math.abs(bal) });
    }
    lines.sort((a, b) => parseInt(a.account_code, 10) - parseInt(b.account_code, 10));

    // 4) Selisih → baris Laba (laba = KREDIT, rugi = DEBIT).
    const sumDebit = lines.reduce((s, l) => (l.side === "DEBIT" ? s + l.nominal : s), 0);
    const sumKredit = lines.reduce((s, l) => (l.side === "KREDIT" ? s + l.nominal : s), 0);
    const diff = sumDebit - sumKredit; // >0 → laba (butuh KREDIT penyeimbang)

    // Cari akun Laba tujuan (tipe MODAL, nama diawali "Laba"). Prioritas:
    // 1) "Laba <bulan ini>"  2) "Tahun Berjalan"  3) "Ditahan"  4) Laba apa pun.
    const periodLabaName = normalizeAccountName(`Laba ${periodLabel(period)}`);
    const modalLaba = Array.from(accMap.values()).filter(
      (a) => a.type === "MODAL" && /^laba\b/i.test(a.name.trim())
    );
    const pick =
      modalLaba.find((a) => normalizeAccountName(a.name) === periodLabaName) ??
      modalLaba.find((a) => /tahun berjalan/i.test(a.name)) ??
      modalLaba.find((a) => /ditahan/i.test(a.name)) ??
      modalLaba[0] ??
      null;

    const labaLine =
      diff === 0
        ? null
        : {
            account_code: pick?.code ?? "",
            account_name: pick?.name ?? "(pilih akun Laba)",
            side: (diff > 0 ? "KREDIT" : "DEBIT") as "DEBIT" | "KREDIT",
            nominal: Math.abs(diff),
          };

    return NextResponse.json({
      success: true,
      data: {
        period,
        tanggal: lastDayOfPeriod(period),
        keterangan: `Jurnal Penutup — ${periodLabel(period)}`,
        laba_bersih: diff, // + laba / − rugi
        nominal_lines: lines,
        laba_line: labaLine,
        laba_account_found: !!pick,
      },
    });
  } catch (error: any) {
    console.error("[closing-draft GET]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Gagal menghitung jurnal penutup" },
      { status: 500 }
    );
  }
}, AKUNTANSI_ROLES);