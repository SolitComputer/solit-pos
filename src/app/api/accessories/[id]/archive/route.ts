import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/accessories/[id]/archive
// body { archived: true }  → arsip manual  (archive_reason = "MANUAL")
// body { archived: false } → kembalikan ke Data Barang (restore)
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    let archived = true;
    try {
      const body = await req.json();
      archived = body?.archived !== false;
    } catch {
      // body opsional → anggap arsip
    }

    const { data: current, error: readErr } = await supabase
      .from("accessories")
      .select("id, name, archived_at")
      .eq("id", id)
      .single();
    if (readErr || !current) {
      return NextResponse.json(
        { success: false, message: readErr?.message || "Aksesori tidak ditemukan" },
        { status: 404 }
      );
    }

    const payload = archived
      ? { archived_at: new Date().toISOString(), archived_by: user.name, archive_reason: "MANUAL" }
      : { archived_at: null, archived_by: null, archive_reason: null };

    const { data, error } = await supabase
      .from("accessories")
      .update(payload)
      .eq("id", id)
      .select("id, archived_at, archived_by, archive_reason")
      .single();
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: archived ? "ARCHIVE" : "UNARCHIVE",
      entity: "accessory_outflow",
      entityId: id,
      entityLabel: current.name,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const PATCH = withAuth(patchHandler, BARANG_FULL_ACCESS_ROLES);