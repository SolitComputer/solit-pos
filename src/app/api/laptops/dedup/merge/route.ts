// src/app/api/laptops/dedup/merge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { LAPTOP_MERGE_ROLES } from "@/lib/permissions";
import { isLaptopsIdentical, getDifferingFields, computeDedupHash } from "@/lib/dedupHash";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { logActivity } from "@/lib/activityLogger";

// ═══════════════════════════════════════════════════════════════════════
// POST /api/laptops/dedup/merge
// ═══════════════════════════════════════════════════════════════════════
// Body: { source_id, target_id }
// Action:
//   1. Fetch kedua laptop
//   2. Validasi STRICT: 6 field identik (brand+name+cpu+ram+storage+gpu)
//   3. Pindah SEMUA laptop_units.laptop_id dari source → target
//   4. Hapus laptop source (cascade: dedup_hash NULL biar ga bentrok)
//   5. Recalc qty target (via helper existing)
//   6. Log activity
//
// Aksi ini IRREVERSIBLE — units pindah card, source hilang. UI harus kasih
// konfirmasi jelas sebelum submit.
async function handler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const { source_id, target_id } = await req.json();

    if (!source_id || !target_id) {
      return NextResponse.json({
        success: false, message: "source_id & target_id wajib diisi",
      }, { status: 400 });
    }

    if (source_id === target_id) {
      return NextResponse.json({
        success: false, message: "Source & target tidak boleh laptop yang sama",
      }, { status: 400 });
    }

    // 1. Fetch keduanya
    const { data: laptops, error: fetchErr } = await supabase
      .from("laptops")
      .select("id, laptop_name, brand, cpu, ram, storage, gpu")
      .in("id", [source_id, target_id]);

    if (fetchErr) {
      return NextResponse.json({ success: false, message: fetchErr.message }, { status: 400 });
    }
    if (!laptops || laptops.length !== 2) {
      return NextResponse.json({
        success: false, message: "Salah satu laptop tidak ditemukan",
      }, { status: 404 });
    }

    const source = laptops.find(l => l.id === source_id)!;
    const target = laptops.find(l => l.id === target_id)!;

    // 2. Validasi STRICT 6 field identik
    if (!isLaptopsIdentical(source, target)) {
      const diff = getDifferingFields(source, target);
      return NextResponse.json({
        success: false,
        message: `Tidak bisa merge: ada ${diff.length} field berbeda (${diff.join(", ")}). Semua 6 field harus sama persis.`,
        differing_fields: diff,
      }, { status: 400 });
    }

    // 3. Count units yang akan dipindah (untuk logging & response)
    const { count: unitCount } = await supabase
      .from("laptop_units")
      .select("id", { count: "exact", head: true })
      .eq("laptop_id", source_id);

    // 4. Pindah semua units ke target
    const { error: moveErr } = await supabase
      .from("laptop_units")
      .update({ laptop_id: target_id })
      .eq("laptop_id", source_id);

    if (moveErr) {
      return NextResponse.json({
        success: false, message: `Gagal pindah units: ${moveErr.message}`,
      }, { status: 400 });
    }

    // 5. Hapus laptop source
    const { error: delErr } = await supabase
      .from("laptops").delete().eq("id", source_id);

    if (delErr) {
      // Rollback: pindah units balik ke source
      await supabase.from("laptop_units").update({ laptop_id: source_id })
        .eq("laptop_id", target_id);
      return NextResponse.json({
        success: false, message: `Gagal hapus source: ${delErr.message}`,
      }, { status: 400 });
    }

    // 6. Pastikan target punya dedup_hash (kalau NULL, compute sekarang)
    //    Supaya laptop baru yang sama persis bisa auto-dedup lewat alur normal.
    const targetHash = await computeDedupHash(target);
    await supabase.from("laptops").update({ dedup_hash: targetHash }).eq("id", target_id);

    // 7. Recalc qty target
    await recalcLaptopParentQty(supabase, target_id);

    // 8. Log activity
    await logActivity({
      userId: user.id, userName: user.name, userRole: user.role,
      action: "DELETE", entity: "laptop", entityId: source_id,
      entityLabel: `MERGE: ${source.laptop_name} → ${target.laptop_name} (${unitCount ?? 0} unit dipindah)`,
      beforeData: source, afterData: { merged_into: target_id },
    });

    return NextResponse.json({
      success: true,
      message: `Berhasil merge: ${unitCount ?? 0} unit dipindah dari "${source.laptop_name}" ke "${target.laptop_name}". Card source dihapus.`,
      units_moved: unitCount ?? 0,
      target_id,
    });
  } catch (err) {
    console.error("[dedup/merge POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(handler, LAPTOP_MERGE_ROLES);