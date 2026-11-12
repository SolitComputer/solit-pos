import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { logActivity } from "@/lib/activityLogger";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, selling_price
        )
      `)
      .in("status", ["SERVICE", "BELUM_SIAP"])
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // ── Enrich: nama Team QC yang menandai MINUS (untuk unit FROM_QC) ──
    //  SELECT * sudah include qc_marked_minus_at dan qc_marked_minus_by (UUID),
    //  tapi frontend butuh nama user untuk ditampilkan di kolom Analisa.
    //
    //  Kenapa query terpisah, bukan JOIN FK (users!qc_marked_minus_by)?
    //    - JOIN FK Supabase bergantung pada nama constraint yg bisa beda per
    //      environment (self-hosted vs cloud) → pernah bikin bug diam.
    //    - Query IN(ids) lebih predictable & tetap 1 roundtrip.
    //    - Dedup dulu via Set → hemat bandwidth untuk banyak unit dari QC
    //      penandai sama.
    const units = data || [];
    const qcMarkerIds = Array.from(
      new Set(
        units
          .map((u: any) => u.qc_marked_minus_by)
          .filter((id: any): id is string => typeof id === "string" && id.length > 0)
      )
    );

    const userNameMap = new Map<string, string>();
    if (qcMarkerIds.length > 0) {
      const { data: userRows } = await supabase
        .from("users")
        .select("id, name")
        .in("id", qcMarkerIds);
      (userRows || []).forEach((u: any) => {
        if (u.id && u.name) userNameMap.set(u.id, u.name);
      });
    }

    const enriched = units.map((u: any) => ({
      ...u,
      // Flat field biar frontend tetap sederhana: cuma baca
      // u.qc_marked_minus_by_name tanpa navigasi nested object.
      qc_marked_minus_by_name: u.qc_marked_minus_by
        ? (userNameMap.get(u.qc_marked_minus_by) ?? null)
        : null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// PUT — update repair_status, repair_notes, analisa, progress_pengerjaan, status
async function putHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { unit_id, repair_status, repair_notes, status, analisa, progress_pengerjaan, minus_status } = body;

    if (!unit_id) {
      return NextResponse.json(
        { success: false, message: "unit_id wajib diisi" },
        { status: 400 }
      );
    }

    // Ambil status SEBELUM diubah — dipakai untuk deteksi transisi minus
    // (SERVICE/BELUM_SIAP) → SIAP_JUAL, buat poin leaderboard Pengelola
    // Barang (+5/unit). Dicek di SINI dan juga di endpoint
    // /api/laptops/minus/decision — keduanya dihitung sama.
    const { data: beforeUnit } = await supabase
      .from("laptop_units")
      .select("status, serial_number, laptop_id")
      .eq("id", unit_id)
      .single();

    const updateData: Record<string, any> = {};
    if (repair_status !== undefined) updateData.repair_status = repair_status;
    if (repair_notes !== undefined) updateData.repair_notes = repair_notes;
    if (status !== undefined) updateData.status = status;
    if (analisa !== undefined) updateData.analisa = analisa;
    if (progress_pengerjaan !== undefined) updateData.progress_pengerjaan = progress_pengerjaan;
    if (minus_status !== undefined) updateData.minus_status = minus_status;

    const { data, error } = await supabase
      .from("laptop_units")
      .update(updateData)
      .eq("id", unit_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // Status unit berubah → sinkronkan qty parent.
    if (updateData.status !== undefined) {
      await recalcLaptopParentQty(supabase, data?.laptop_id);
    }

    // ✅ Leaderboard Pengelola Barang: unit yang tadinya minus (SERVICE/
    // BELUM_SIAP) dan SEKARANG jadi SIAP_JUAL dicatat sebagai "MINUS_FIXED"
    // supaya bisa dihitung +5 poin. Cek beforeUnit.status (status SEBELUM
    // update), bukan data.status (itu sudah status SESUDAH update).
    const wasMinus = beforeUnit?.status === "SERVICE" || beforeUnit?.status === "BELUM_SIAP";
    if (wasMinus && updateData.status === "SIAP_JUAL") {
      await logActivity({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "MINUS_FIXED",
        entity: "unit",
        entityId: unit_id,
        entityLabel: `SN: ${beforeUnit?.serial_number ?? data.serial_number}`,
        beforeData: beforeUnit,
        afterData: data,
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_PENGELOLA_BARANG", "KEPALA_ADMIN_BARANG", "ADMIN_BARANG"]);
export const PUT = withAuth(putHandler, ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_PENGELOLA_BARANG"]);