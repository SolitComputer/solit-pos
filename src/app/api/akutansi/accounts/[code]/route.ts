import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_TYPE_ORDER } from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── PUT — edit akun: nama, tipe, DAN kode (kode via RPC transaksi khusus) ──
export const PUT = withAuth(async (req, ctx, user: any) => {
  const { code } = await ctx.params;
  if (!code) return NextResponse.json({ success: false, message: "Kode tidak valid" }, { status: 400 });

  const body = await req.json();
  const { name, type, new_code } = body as { name: string; type: string; new_code?: string };

  if (!name?.trim())
    return NextResponse.json({ success: false, message: "Nama akun wajib diisi" }, { status: 400 });
  if (!ACCOUNT_TYPE_ORDER.includes(type as any))
    return NextResponse.json({ success: false, message: "Tipe akun tidak dikenal" }, { status: 400 });

  const supabase = getAdmin();

  const { data: existing } = await supabase
    .from("chart_of_accounts")
    .select("code, is_builtin")
    .eq("code", code)
    .maybeSingle();

  if (!existing)
    return NextResponse.json({ success: false, message: "Akun tidak ditemukan" }, { status: 404 });

  // ── Kalau kode mau diubah, jalankan rename dulu (via fungsi transaksi) ──
  let effectiveCode = code;
  if (new_code && new_code.trim() && new_code.trim() !== code) {
    const trimmedNewCode = new_code.trim();
    if (!/^\d{2,6}$/.test(trimmedNewCode))
      return NextResponse.json({ success: false, message: "Kode baru harus angka 2-6 digit" }, { status: 400 });

    const { error: renameErr } = await supabase.rpc("rename_account_code", {
      old_code: code,
      new_code: trimmedNewCode,
    });

    if (renameErr) {
      console.error("[accounts PUT rename]", renameErr);
      return NextResponse.json({ success: false, message: renameErr.message }, { status: 409 });
    }

    // Pengaman tambahan: pastikan journal_lines & journal_opening_balances ikut
    // pindah ke kode baru, jaga-jaga kalau RPC rename_account_code di DB tidak
    // (atau belum) meng-cascade ke tabel-tabel ini — supaya Buku Besar/Neraca
    // tidak pernah "kehilangan" mutasi akibat kode lama jadi yatim.
    const [{ error: lineCascadeErr }, { error: openingCascadeErr }] = await Promise.all([
      supabase.from("journal_lines").update({ account_code: trimmedNewCode }).eq("account_code", code),
      supabase.from("journal_opening_balances").update({ account_code: trimmedNewCode }).eq("account_code", code),
    ]);
    if (lineCascadeErr) console.error("[accounts PUT] cascade journal_lines:", lineCascadeErr.message);
    if (openingCascadeErr) console.error("[accounts PUT] cascade opening_balances:", openingCascadeErr.message);

    effectiveCode = trimmedNewCode;
  }

  const { data: updated, error } = await supabase
    .from("chart_of_accounts")
    .update({ name: name.trim(), type, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("code", effectiveCode)
    .select("code, name, type, is_builtin, updated_at")
    .single();

  if (error) {
    console.error("[accounts PUT]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updated });
}, AKUNTANSI_MANAGE_ROLES);

// ── DELETE — hapus akun apapun, DITOLAK hanya kalau sudah punya mutasi tercatat ──
// (proteksi ini wajib ada — bukan pembatasan gaya, tapi mencegah data jurnal
// jadi yatim/orphan yang tidak bisa dipulihkan)
export const DELETE = withAuth(async (_req, ctx) => {
  const { code } = await ctx.params;
  if (!code) return NextResponse.json({ success: false, message: "Kode tidak valid" }, { status: 400 });

  const supabase = getAdmin();

  const [
    { data: usedInLines, error: usedInLinesErr },
    { data: usedInOpening, error: usedInOpeningErr },
  ] = await Promise.all([
    supabase.from("journal_lines").select("id").eq("account_code", code).limit(1),
    supabase.from("journal_opening_balances").select("account_code").eq("account_code", code).maybeSingle(),
  ]);

  // ✅ FIX: dulu error dari cek "masih dipakai?" tidak dicek — kalau query
  // gagal, hasilnya (undefined) dianggap sama dengan "tidak dipakai" (fail-
  // open), akun bisa terhapus padahal mutasinya masih ada. Sekarang gagal
  // cek = tolak hapus (fail-closed), bukan lolos diam-diam.
  if (usedInLinesErr || usedInOpeningErr) {
    console.error("[accounts DELETE] gagal cek pemakaian akun:", usedInLinesErr?.message, usedInOpeningErr?.message);
    return NextResponse.json(
      { success: false, message: "Gagal memverifikasi apakah akun masih dipakai — dibatalkan demi keamanan" },
      { status: 500 }
    );
  }

  if ((usedInLines && usedInLines.length > 0) || usedInOpening) {
    return NextResponse.json(
      { success: false, message: "Akun ini sudah punya mutasi jurnal/saldo awal tercatat — hapus dulu mutasinya kalau tetap ingin menghapus akun ini" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("chart_of_accounts").delete().eq("code", code);

  if (error) {
    console.error("[accounts DELETE]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, AKUNTANSI_MANAGE_ROLES);