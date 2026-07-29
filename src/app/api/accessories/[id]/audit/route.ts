// src/app/api/accessories/[id]/audit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

// Harus SAMA dengan AUDIT_TTL_MS di AccessoriesContent.tsx (auto-reset 3 hari).
const AUDIT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// Audit HANYA boleh dilakukan/dibatalkan oleh ADMIN (dibatasi — sebelumnya ikut CREATE_ROLES)
const AUDIT_ROLES: UserRole[] = ["ADMIN"];

// Boleh lihat riwayat audit (samain dgn ALLOWED_ROLES di route accessories)
const AUDIT_VIEW_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG",
  "TEKNISI", "KEPALA_TEKNISI",
  "KEPALA_SALES", "CREW_SALES",
  "ACCOUNTING",
];

// ─── PATCH: toggle audit (tandai / batalkan) ───────────────────────────────
async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data: current, error: readErr } = await supabaseAdmin
      .from("accessories")
      .select("id, name, audited_at, audited_by")
      .eq("id", id)
      .single();

    if (readErr || !current) {
      return NextResponse.json(
        { success: false, message: readErr?.message || "Aksesori tidak ditemukan" },
        { status: 404 }
      );
    }

    // Audit dianggap AKTIF hanya kalau belum lewat TTL (auto-reset 3 hari)
    const isActive =
      current.audited_at != null &&
      Date.now() - new Date(current.audited_at).getTime() < AUDIT_TTL_MS;

    // Aktif → batalkan (undo). Belum/expired → tandai diaudit sekarang.
    const nowIso = new Date().toISOString();
    const payload = isActive
      ? { audited_at: null, audited_by: null }
      : { audited_at: nowIso, audited_by: user.name };

    const { data, error } = await supabaseAdmin
      .from("accessories")
      .update(payload)
      .eq("id", id)
      .select("id, audited_at, audited_by")
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Riwayat permanen — TIDAK ikut ter-reset walau status di tabel utama lewat TTL
    await supabaseAdmin.from("accessory_audit_logs").insert({
      accessory_id: id,
      action: isActive ? "UNAUDIT" : "AUDIT",
      audited_by: user.name,
      audited_at: nowIso,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

// ─── GET: status + riwayat audit ───────────────────────────────────────────
async function getHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    const { data: current, error: readErr } = await supabaseAdmin
      .from("accessories")
      .select("audited_at, audited_by")
      .eq("id", id)
      .single();

    if (readErr) {
      return NextResponse.json({ success: false, message: readErr.message }, { status: 400 });
    }

    // Riwayat lengkap (AUDIT & UNAUDIT), terbaru dulu — tidak terpengaruh TTL.
    const { data: history, error: historyErr } = await supabaseAdmin
      .from("accessory_audit_logs")
      .select("id, action, audited_by, audited_at")
      .eq("accessory_id", id)
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

export const GET = withAuth(getHandler, AUDIT_VIEW_ROLES);
export const PATCH = withAuth(patchHandler, AUDIT_ROLES);