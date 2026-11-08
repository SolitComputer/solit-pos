import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/laptops/[id]/archive
// body { archived: true }  → arsip manual  (archive_reason = "MANUAL")
// body { archived: false } → kembalikan ke Data Barang (restore)
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    let archived = true; // default: arsip
    try {
      const body = await req.json();
      archived = body?.archived !== false;
    } catch {
      // body opsional → anggap arsip
    }

    const { data: current, error: readErr } = await supabase
      .from("laptops")
      .select("id, laptop_name, archived_at")
      .eq("id", id)
      .single();
    if (readErr || !current) {
      return NextResponse.json(
        { success: false, message: readErr?.message || "Laptop tidak ditemukan" },
        { status: 404 }
      );
    }

        // ⬅️ BARU: cegah arsip kalau masih ada unit yang terkunci di Kelompok MSJ.
    //  Tanpa ini, unit yang masih hidup di kelompok ikut "terjebak" di barang
    //  terarsip — hilang dari Data Barang & tak bisa dicari via SN (bug 0005579).
    if (archived) {
      const { data: lockedUnits } = await supabase
        .from("laptop_units")
        .select("serial_number")
        .eq("laptop_id", id)
        .not("msj_group_id", "is", null)
        .not("status", "in", "(SOLD,TERJUAL,KELUAR,RETURNED,RESERVED,HELD,PACKING,PENDING)");

      if (lockedUnits && lockedUnits.length > 0) {
        const sns = lockedUnits.map((u) => u.serial_number).join(", ");
        return NextResponse.json(
          {
            success: false,
            message: `Tidak bisa mengarsipkan: masih ada ${lockedUnits.length} unit terkunci di Kelompok MSJ (SN: ${sns}). Lepaskan dari halaman Minus Siap Jual dulu sebelum mengarsipkan barang ini.`,
          },
          { status: 409 }
        );
      }
    }

    const payload = archived
      ? { archived_at: new Date().toISOString(), archived_by: user.name, archive_reason: "MANUAL" }
      : { archived_at: null, archived_by: null, archive_reason: null };

    const { data, error } = await supabase
      .from("laptops")
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
      entity: "laptop",
      entityId: id,
      entityLabel: current.laptop_name,
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