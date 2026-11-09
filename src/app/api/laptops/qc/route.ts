// app/api/laptops/qc/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";
import { isUnitQcComplete, getMissingQcFields } from "@/lib/qcCriteria";
import { logActivity } from "@/lib/activityLogger";

// Role yang masuk "Team QC" = Kepala Admin Barang + Admin Barang
const TEAM_QC_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_ADMIN_BARANG", "ADMIN_BARANG",
] as UserRole[];

// ─── GET /api/laptops/qc ───────────────────────────────────────────────
// List semua unit yang perlu QC (qc_status = 'NEEDS_QC')
async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, gpu, display,
          condition_note, selling_price
        )
      `)
      .eq("qc_status", "NEEDS_QC")
      .order("created_at", { ascending: true }); // FIFO — barang datang duluan diproses dulu

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Tambahin daftar field yang masih kosong per unit → biar UI bisa kasih hint
    const enriched = (data ?? []).map((u: Record<string, any>) => ({
      ...u,
      missing_fields: u.laptop ? getMissingQcFields(
        u as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
        u.laptop as unknown as import("@/lib/qcCriteria").LaptopForQc
      ) : [],
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[qc GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ─── POST /api/laptops/qc ──────────────────────────────────────────────
// Submit kriteria QC — Team QC isi field yang kurang
// Body: { unit_id, updates: { grade?, source?, condition_note?, purchase_price?, ... } }
// Logic:
//   1. Update field unit (& parent laptop kalau ada field model)
//   2. Cek kelengkapan via isUnitQcComplete()
//   3. Kalau lengkap → qc_status = QC_DONE, status = SIAP_JUAL
//   4. Kalau belum  → tetap NEEDS_QC
//   5. Log ke qc_history
async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const { unit_id, updates } = await req.json();

    if (!unit_id || !updates || typeof updates !== "object") {
      return NextResponse.json({ success: false, message: "unit_id dan updates wajib" }, { status: 400 });
    }

    // 1. Ambil data unit + laptop current state
    const { data: unit, error: fetchErr } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(*)")
      .eq("id", unit_id)
      .single();

    if (fetchErr || !unit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    // 2. Pisahkan updates untuk unit vs laptop
    const UNIT_FIELDS = ["serial_number", "grade", "source", "condition_note",
                         "purchase_price", "sparepart_cost", "selling_price", "official_price"];
    const LAPTOP_FIELDS = ["brand", "cpu", "ram", "storage", "laptop_name"];

    const unitUpdates: Record<string, any> = {};
    const laptopUpdates: Record<string, any> = {};

    for (const [k, v] of Object.entries(updates)) {
      if (UNIT_FIELDS.includes(k)) unitUpdates[k] = v;
      else if (LAPTOP_FIELDS.includes(k)) laptopUpdates[k] = v;
    }

    // 3. Apply updates
    if (Object.keys(laptopUpdates).length > 0) {
      const { error: lErr } = await supabase
        .from("laptops").update(laptopUpdates).eq("id", unit.laptop_id);
      if (lErr) {
        return NextResponse.json({ success: false, message: `Update laptop: ${lErr.message}` }, { status: 400 });
      }
    }

    if (Object.keys(unitUpdates).length > 0) {
      const { error: uErr } = await supabase
        .from("laptop_units").update(unitUpdates).eq("id", unit_id);
      if (uErr) {
        return NextResponse.json({ success: false, message: `Update unit: ${uErr.message}` }, { status: 400 });
      }
    }

    // 4. Re-fetch state terbaru untuk cek kelengkapan
    const { data: fresh } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(*)")
      .eq("id", unit_id)
      .single();

    if (!fresh || !fresh.laptop) {
      return NextResponse.json({ success: false, message: "Gagal re-fetch unit" }, { status: 500 });
    }

    // 5. Cek kelengkapan → kalau lengkap auto SIAP_JUAL
    // Cast ke tipe yang cocok — fresh dari Supabase bertipe Record<string, any>,
    // tapi isUnitQcComplete minta interface spesifik. Field yg diperlukan sudah
    // pasti ada karena select("*") dan select("laptops(*)").
    const isComplete = isUnitQcComplete(
      fresh as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
      fresh.laptop as unknown as import("@/lib/qcCriteria").LaptopForQc
    );
    let finalQcStatus = fresh.qc_status;
    let finalStatus = fresh.status;

    if (isComplete) {
      finalQcStatus = "QC_DONE";
      finalStatus = "SIAP_JUAL";

      await supabase.from("laptop_units").update({
        qc_status: "QC_DONE",
        status: "SIAP_JUAL",
        qc_completed_at: new Date().toISOString(),
        qc_completed_by: user.id,
      }).eq("id", unit_id);

      // Log ke qc_history
      await supabase.from("qc_history").insert({
        unit_id,
        laptop_id: fresh.laptop_id,
        from_qc_status: fresh.qc_status,
        to_qc_status: "QC_DONE",
        from_status: fresh.status,
        to_status: "SIAP_JUAL",
        actor_user_id: user.id,
        actor_name: user.name,
        reason: "Kriteria QC lengkap — otomatis naik ke SIAP_JUAL",
      });

      // Log aktivitas
      // Pakai action "EDIT" (yg sudah ada di LogAction type) + entityLabel spesifik
      // "— QC selesai" sebagai penanda transisi QC. Pola sama dgn
      // pengelola-points yg mendeteksi lewat ilike("entity_label", "%tes kondisi%").
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "unit", entityId: unit_id,
        entityLabel: `SN: ${fresh.serial_number} — QC selesai`,
        afterData: { qc_status: "QC_DONE", status: "SIAP_JUAL" },
      });
    }

    return NextResponse.json({
      success: true,
      is_complete: isComplete,
      qc_status: finalQcStatus,
      status: finalStatus,
      missing_fields: isComplete ? [] : getMissingQcFields(
        fresh as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
        fresh.laptop as unknown as import("@/lib/qcCriteria").LaptopForQc
      ),
    });
  } catch (err) {
    console.error("[qc POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, TEAM_QC_ROLES);
export const POST = withAuth(postHandler, TEAM_QC_ROLES);