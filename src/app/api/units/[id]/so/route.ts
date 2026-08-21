import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { SO_ROLES, SO_LIMITED_USER_IDS, expandRolesWithParents } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

//  Harus sama dengan SO_TTL_MS di src/app/dashboard/laptops/[id]/units/page.tsx (1 hari).
const SO_TTL_MS = 1 * 24 * 60 * 60 * 1000;

// Sama polanya dgn canSoLaptop() di /api/laptops/[id]/so — bedanya di sini
// cek status unit itu SENDIRI (bukan agregat), karena 1 unit = 1 baris.
async function canSoUnit(user: AuthUser, unitStatus: string, isPriceComplete: boolean): Promise<boolean> {
  const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
  if (effectiveRoles.some((r) => (SO_ROLES as string[]).includes(r))) return true;
  if (SO_LIMITED_USER_IDS.includes(user.id)) return unitStatus === "SIAP_JUAL" && isPriceComplete;
  return false;
}

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    let notes: string | undefined = undefined;
    try {
      const body = await req.json();
      notes = typeof body?.notes === "string" ? body.notes.trim() : undefined;
    } catch {
      // Body opsional
    }

    const { data: current, error: readErr } = await supabase
      .from("laptop_units")
      .select("id, serial_number, laptop_id, so_at, so_by")
      .eq("id", id)
      .single();

    if (readErr || !current) {
      return NextResponse.json(
        { success: false, message: readErr?.message || "Unit tidak ditemukan" },
        { status: 404 }
      );
    }

    const isActive =
      current.so_at != null &&
      Date.now() - new Date(current.so_at).getTime() < SO_TTL_MS;

    const payload = isActive
      ? { so_at: null, so_by: null }
      : { so_at: new Date().toISOString(), so_by: user.name };

    const { data, error } = await supabase
      .from("laptop_units")
      .update(payload)
      .eq("id", id)
      .select("id, so_at, so_by")
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: isActive ? "UNSO" : "SO",
      entity: "unit",
      entityId: id,
      entityLabel: `SN: ${current.serial_number}`,
      reason: notes || null,
    });

    await supabase.from("laptop_unit_so_logs").insert({
      unit_id: id,
      action: isActive ? "UNSO" : "SO",
      so_by: user.name,
      so_at: new Date().toISOString(),
      notes: notes || null,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data: current, error: readErr } = await supabase
      .from("laptop_units")
      .select("so_at, so_by")
      .eq("id", id)
      .single();

    if (readErr) {
      return NextResponse.json({ success: false, message: readErr.message }, { status: 400 });
    }

    const { data: history, error: historyErr } = await supabase
      .from("laptop_unit_so_logs")
      .select("id, action, so_by, so_at, notes")
      .eq("unit_id", id)
      .order("so_at", { ascending: false })
      .limit(20);

    if (historyErr) {
      return NextResponse.json({ success: false, message: historyErr.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: { current, history: history ?? [] },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);