import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isValidPeriod, periodFromDate, isBalanced } from "@/lib/accounting";
import {
  buildDraftsForPeriod,
  draftKey,
  draftToLineRows,
  getPostedKeys,
} from "@/lib/accountingSource";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── POST /api/akuntansi/jurnal/confirm ───────────────────────────────────────
// body: { period, items?: [{ source_type, source_id }] }   items kosong = konfirmasi SEMUA pending
export const POST = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { period, items } = body as {
    period: string;
    items?: { source_type: string; source_id: string }[];
  };

  if (!isValidPeriod(period))
    return NextResponse.json({ success: false, message: "Periode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  let drafts, posted;
  try {
    [drafts, posted] = await Promise.all([
      buildDraftsForPeriod(supabase, period),
      getPostedKeys(supabase),
    ]);
  } catch (e: any) {
    console.error("[akuntansi confirm]", e);
    return NextResponse.json(
      { success: false, message: e?.message ?? "Gagal memuat data untuk konfirmasi" },
      { status: 500 }
    );
  }

  const wanted =
    items && items.length > 0
      ? new Set(items.map((i) => `${i.source_type}:${i.source_id}`))
      : null;

  let selected = drafts.filter((d) => {
    const key = draftKey(d);
    if (posted.has(key)) return false;              // sudah pernah diposting
    return wanted ? wanted.has(key) : true;         // null = semua
  });

  if (selected.length === 0)
    return NextResponse.json({ success: true, data: { inserted: 0 }, message: "Tidak ada data pending" });

  // ✅ FIX: beda dari jalur buat/edit manual (yang selalu cek isBalanced
  // sebelum simpan), jalur confirm ini langsung posting draft ke buku besar
  // tanpa validasi debit=kredit. Draft yang tidak balance (mis. bug di
  // logic pembangun draft transaksi tertentu) dibuang dari batch di sini
  // supaya tidak ikut ter-posting; sisanya yang balance tetap diproses.
  const unbalanced = selected.filter((d) => !isBalanced(d.lines));
  if (unbalanced.length > 0) {
    console.error(
      "[akuntansi confirm] draft tidak balance, dilewati:",
      unbalanced.map((d) => draftKey(d))
    );
  }
  selected = selected.filter((d) => isBalanced(d.lines));

  if (selected.length === 0) {
    return NextResponse.json({
      success: true,
      data: { inserted: 0, skipped_unbalanced: unbalanced.length },
      message: "Semua data terpilih tidak balance (debit ≠ kredit) — tidak ada yang diposting",
    });
  }

  const entryRows = selected.map((d) => ({
    period: periodFromDate(d.tanggal),
    tanggal: d.tanggal,
    keterangan: d.keterangan,
    ref: d.ref,
    source_type: d.source_type,
    source_id: d.source_id,
    source_category: d.source_category,
    total: d.total,
    created_by: user.id,
  }));

  let { data: inserted, error: entryErr } = await supabase
    .from("journal_entries")
    .insert(entryRows)
    .select("id, source_type, source_id");

  let skippedCount = 0;

  // (fix) "duplicate key value violates unique constraint journal_entries_source_uniq"
  // bisa terjadi kalau salah satu item yang dipilih ternyata SUDAH pernah
  // dikonfirmasi (daftar pending di layar sempat basi). Sebelumnya error ini
  // bikin SELURUH batch gagal walau item lain di batch itu masih valid.
  // Sekarang: kalau errornya spesifik unique violation (kode Postgres 23505 —
  // berlaku untuk constraint apa pun bentuknya, jadi tidak perlu tau persis
  // definisi constraint-nya), cek ulang ke DB item mana yang bentrok, buang
  // dari daftar, lalu insert ulang HANYA sisanya.
  if (entryErr?.code === "23505") {
    const freshPosted = await getPostedKeys(supabase);
    skippedCount = selected.filter((d) => freshPosted.has(draftKey(d))).length;
    selected = selected.filter((d) => !freshPosted.has(draftKey(d)));

    if (selected.length === 0) {
      return NextResponse.json({
        success: true,
        data: { inserted: 0, skipped: skippedCount },
        message: "Semua data terpilih ternyata sudah pernah dikonfirmasi sebelumnya",
      });
    }

    const retryEntryRows = selected.map((d) => ({
      period: periodFromDate(d.tanggal),
      tanggal: d.tanggal,
      keterangan: d.keterangan,
      ref: d.ref,
      source_type: d.source_type,
      source_id: d.source_id,
      source_category: d.source_category,
      total: d.total,
      created_by: user.id,
    }));

    const retry = await supabase
      .from("journal_entries")
      .insert(retryEntryRows)
      .select("id, source_type, source_id");

    inserted = retry.data;
    entryErr = retry.error;
  }

  if (entryErr || !inserted) {
    console.error("[akuntansi confirm] insert entries:", entryErr);
    return NextResponse.json({ success: false, message: entryErr?.message ?? "Gagal konfirmasi" }, { status: 500 });
  }

  const idMap = new Map<string, string>(
    inserted.map((e: any) => [draftKey(e), e.id as string])
  );

  const lineRows = selected.flatMap((d) => {
    const entryId = idMap.get(draftKey(d));
    if (!entryId) return [];
    return draftToLineRows(entryId, d.lines);
  });

  const { error: lineErr } = await supabase.from("journal_lines").insert(lineRows);

  if (lineErr) {
    await supabase.from("journal_entries").delete().in("id", inserted.map((e: any) => e.id));
    console.error("[akuntansi confirm] insert lines:", lineErr);
    return NextResponse.json({ success: false, message: lineErr.message }, { status: 500 });
  }

  await supabase.from("journal_audit_logs").insert(
    selected.map((d) => ({
      entry_id: idMap.get(draftKey(d)) ?? null,
      period: periodFromDate(d.tanggal),
      action: "CONFIRM",
      before_data: null,
      after_data: { source: draftKey(d), keterangan: d.keterangan, lines: d.lines },
      changed_by: user.id,
    }))
  );

  return NextResponse.json(
    { success: true, data: { inserted: selected.length, skipped: skippedCount, skipped_unbalanced: unbalanced.length } },
    { status: 201 }
  );
}, AKUNTANSI_MANAGE_ROLES);