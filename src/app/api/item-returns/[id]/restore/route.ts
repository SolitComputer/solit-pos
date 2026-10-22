import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Fallback status kalau prev_status kosong (data retur lama sebelum kolom
// prev_status ada). Normalnya restore pakai ret.prev_status langsung.
const LAPTOP_FALLBACK_STATUS = "SIAP_JUAL";
const ACC_FALLBACK_STATUS = "READY";

// ── POST /api/item-returns/[id]/restore ──────────────────────────────────────
// Tarik balik 1 retur: unit.status dipulihkan + is_restored = true.
export const POST = withAuth(async (_req, ctx, user) => {
  const { id } = await ctx.params;
  const supabase = getAdmin();

  // Ambil baris retur
  const { data: ret, error: findErr } = await supabase
    .from("item_returns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (findErr) return NextResponse.json({ success: false, message: findErr.message }, { status: 500 });
  if (!ret) return NextResponse.json({ success: false, message: "Data retur tidak ditemukan" }, { status: 404 });
  if (ret.is_restored)
    return NextResponse.json({ success: false, message: "Retur ini sudah di-restore sebelumnya" }, { status: 400 });

  // 1) Pulihkan status unit asli ke prev_status (status sebelum diretur).
  //    Fallback ke status aktif default kalau prev_status kosong (data lama).
  if (ret.item_type === "LAPTOP" && ret.laptop_unit_id) {
    const { error } = await supabase
      .from("laptop_units")
      .update({ status: ret.prev_status || LAPTOP_FALLBACK_STATUS })
      .eq("id", ret.laptop_unit_id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  } else if (ret.item_type === "AKSESORIS" && ret.accessory_unit_id) {
    const { error } = await supabase
      .from("accessory_units")
      .update({ status: ret.prev_status || ACC_FALLBACK_STATUS })
      .eq("id", ret.accessory_unit_id);
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // 2) Tandai retur sudah di-restore (jurnal reversal nanti terbentuk dari sini)
  const { data: updated, error: upErr } = await supabase
    .from("item_returns")
    .update({ is_restored: true, restored_at: new Date().toISOString(), restored_by: user.id })
    .eq("id", id)
    .select("*")
    .single();

  if (upErr) return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });
  return NextResponse.json({ success: true, data: updated });
}, BARANG_FULL_ACCESS_ROLES);