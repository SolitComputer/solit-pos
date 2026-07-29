import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { BARANG_PRIVATE_VIEW_ROLES } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

//  Harus sama dengan SO_TTL di LaptopsContent (1 hari).
const SO_TTL_MS = 1 * 24 * 60 * 60 * 1000;

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    // Cek status SO sekarang untuk memutuskan set atau clear
    const { data: current, error: readErr } = await supabase
      .from("laptops")
      .select("id, laptop_name, so_at, so_by")
      .eq("id", id)
      .single();

    if (readErr || !current) {
      return NextResponse.json(
        { success: false, message: readErr?.message || "Laptop tidak ditemukan" },
        { status: 404 }
      );
    }

    // SO dianggap aktif hanya jika belum lewat 1 hari (auto-reset)
    const isActive =
      current.so_at != null &&
      Date.now() - new Date(current.so_at).getTime() < SO_TTL_MS;

    // Aktif → batalkan (undo). Belum/expired → tandai SO sekarang.
    const payload = isActive
      ? { so_at: null, so_by: null }
      : { so_at: new Date().toISOString(), so_by: user.name };

    const { data, error } = await supabase
      .from("laptops")
      .update(payload)
      .eq("id", id)
      .select("id, so_at, so_by")
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // History "siapa yang SO" tercatat permanen di activity log
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: isActive ? "UNSO" : "SO",
      entity: "laptop",
      entityId: id,
      entityLabel: current.laptop_name,
    });

    // Catat juga ke laptop_so_logs — riwayat ini TIDAK ikut ter-reset
    // walau status "aktif" di tabel laptops sudah lewat TTL 1 hari.
    await supabase.from("laptop_so_logs").insert({
      laptop_id: id,
      action: isActive ? "UNSO" : "SO",
      so_by: user.name,
      so_at: new Date().toISOString(),
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
      .from("laptops")
      .select("so_at, so_by")
      .eq("id", id)
      .single();

    if (readErr) {
      return NextResponse.json({ success: false, message: readErr.message }, { status: 400 });
    }

    // Riwayat lengkap (SO & UNSO), terbaru dulu — tidak terpengaruh TTL.
    const { data: history, error: historyErr } = await supabase
      .from("laptop_so_logs")
      .select("id, action, so_by, so_at")
      .eq("laptop_id", id)
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

export const GET = withAuth(getHandler, BARANG_PRIVATE_VIEW_ROLES);
export const PATCH = withAuth(patchHandler, BARANG_PRIVATE_VIEW_ROLES);