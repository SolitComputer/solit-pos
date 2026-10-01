import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { canEditConditionChecks, type UserRole } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

// ── PATCH: Update HANYA condition_checks (tes kondisi) satu MODEL laptop ───────
//
// Terpisah dari PUT /api/laptops/[id] yang di-gate full-access laptop. Di sini
// gerbangnya CUMA canEditConditionChecks, supaya role editor checklist (mis.
// PKL_PENGELOLA_BARANG / PENYEDIA_BARANG) bisa isi tes kondisi di Data Barang
// TANPA full-access. Hanya menyentuh condition_checks → tidak ada efek samping
// ke harga/stok.
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const actorRoles: string[] =
      Array.isArray((user as { roles?: string[] }).roles) &&
        (user as { roles?: string[] }).roles!.length > 0
        ? (user as { roles?: string[] }).roles!
        : [user.role];

    if (!canEditConditionChecks(user.id, actorRoles as UserRole[])) {
      return NextResponse.json(
        { success: false, message: "Tidak punya izin mengubah tes kondisi barang ini" },
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
      .from("laptops")
      .select("id, laptop_name, condition_checks")
      .eq("id", id)
      .single();

    if (!before) {
      return NextResponse.json(
        { success: false, message: "Barang tidak ditemukan" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("laptops")
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
      entity: "laptop",
      entityId: id,
      entityLabel: `${before.laptop_name} — tes kondisi`,
      beforeData: { condition_checks: before.condition_checks },
      afterData: { condition_checks: data.condition_checks },
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/laptops/[id]/condition-checks]", err);
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan tes kondisi" },
      { status: 500 }
    );
  }
}

export const PATCH = withAuth(patchHandler);