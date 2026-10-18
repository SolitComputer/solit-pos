import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { canEditConditionChecks, type UserRole } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

// ── PATCH: Update HANYA condition_checks (tes kondisi) satu UNIT (per SN) ──────
//
// Terpisah dari PUT /api/units/[id] yang di-gate BARANG_FULL_ACCESS_ROLES. Di
// sini gerbangnya CUMA canEditConditionChecks, supaya role editor checklist
// (mis. PKL_PENGELOLA_BARANG / PENYEDIA_BARANG) bisa isi tes kondisi TANPA
// full-access. Hanya menyentuh condition_checks → tidak ada efek samping ke
// sync qty parent / harga.
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const actorRoles: string[] =
      Array.isArray((user as { roles?: string[] }).roles) &&
        (user as { roles?: string[] }).roles!.length > 0
        ? (user as { roles?: string[] }).roles!
        : [user.role];

    if (!canEditConditionChecks(user.id, actorRoles as UserRole[])) {
      return NextResponse.json(
        { success: false, message: "Tidak punya izin mengubah tes kondisi unit ini" },
        { status: 403 }
      );
    }

    const { id } = await props.params;
    const body = await req.json();

    if (
      body.condition_checks === undefined ||
      body.condition_checks === null ||
      typeof body.condition_checks !== "object" ||
      Array.isArray(body.condition_checks)
    ) {
      return NextResponse.json(
        { success: false, message: "condition_checks wajib diisi berupa objek" },
        { status: 400 }
      );
    }

    const { data: before } = await supabase
      .from("laptop_units")
      .select("id, serial_number, condition_checks")
      .eq("id", id)
      .single();

    if (!before) {
      return NextResponse.json(
        { success: false, message: "Unit tidak ditemukan" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("laptop_units")
      .update({
        condition_checks: body.condition_checks,
        condition_checked_by: user.name,          // ← siapa yang mengisi
        condition_checked_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "EDIT",
      entity: "unit",
      entityId: id,
      entityLabel: `SN: ${before.serial_number} — tes kondisi`,
      beforeData: { condition_checks: before.condition_checks },
      afterData: { condition_checks: data.condition_checks },
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/units/[id]/condition-checks]", err);
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan tes kondisi" },
      { status: 500 }
    );
  }
}

export const PATCH = withAuth(patchHandler);