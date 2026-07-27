import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { BARANG_PRIVATE_VIEW_ROLES } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

//  Harus sama dengan AUDIT_TTL di LaptopsContent (2 hari).
const AUDIT_TTL_MS = 2 * 24 * 60 * 60 * 1000;

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    // Cek status audit sekarang untuk memutuskan set atau clear
    const { data: current, error: readErr } = await supabase
      .from("laptops")
      .select("id, laptop_name, audited_at, audited_by")
      .eq("id", id)
      .single();

    if (readErr || !current) {
      return NextResponse.json(
        { success: false, message: readErr?.message || "Laptop tidak ditemukan" },
        { status: 404 }
      );
    }

    // Audit dianggap aktif hanya jika belum lewat 2 hari (auto-reset)
    const isActive =
      current.audited_at != null &&
      Date.now() - new Date(current.audited_at).getTime() < AUDIT_TTL_MS;

    // Aktif → batalkan (undo). Belum/expired → tandai diaudit sekarang.
    const payload = isActive
      ? { audited_at: null, audited_by: null }
      : { audited_at: new Date().toISOString(), audited_by: user.name };

    const { data, error } = await supabase
      .from("laptops")
      .update(payload)
      .eq("id", id)
      .select("id, audited_at, audited_by")
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // History "siapa yang audit" tercatat permanen di activity log
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: isActive ? "UNAUDIT" : "AUDIT",
      entity: "laptop",
      entityId: id,
      entityLabel: current.laptop_name,
    });

    // Catat juga ke laptop_audit_logs — riwayat ini TIDAK ikut ter-reset
    // walau status "aktif" di tabel laptops sudah lewat TTL 2 hari.
    await supabase.from("laptop_audit_logs").insert({
      laptop_id: id,
      action: isActive ? "UNAUDIT" : "AUDIT",
      audited_by: user.name,
      audited_at: new Date().toISOString(),
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
      .select("audited_at, audited_by")
      .eq("id", id)
      .single();

    if (readErr) {
      return NextResponse.json({ success: false, message: readErr.message }, { status: 400 });
    }

    // Riwayat lengkap (AUDIT & UNAUDIT), terbaru dulu — tidak terpengaruh TTL.
    const { data: history, error: historyErr } = await supabase
      .from("laptop_audit_logs")
      .select("id, action, audited_by, audited_at")
      .eq("laptop_id", id)
      .order("audited_at", { ascending: false })
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