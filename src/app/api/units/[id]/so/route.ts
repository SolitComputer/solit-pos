import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { SO_ROLES, SO_LIMITED_USER_IDS, expandRolesWithParents } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

// Reset SO unit sekarang MANUAL — dilakukan lewat tombol Reset SO di halaman
// Data Barang (POST /api/so/reset). Tidak ada TTL harian lagi.

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

    // SO unit aktif = so_at terisi (tidak ada TTL harian).
    const isActive = current.so_at != null;

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

    // ── ROLLUP ke parent laptops.so_at ──────────────────────────────────
    // Begitu SEMUA unit aktif (bukan SOLD/KELUAR, bukan anggota Kelompok MSJ)
    // sudah di-SO HARI INI, baris model di Data Barang otomatis ditandai
    // "Sudah SO". Kalau ada 1 unit saja yang belum / di-batalkan, tanda di
    // baris model ikut dicabut. Inilah yang menaikkan status SO per-unit
    // (dari Kelola Unit) ke level model — tanpa perlu tombol SO di baris luar.
    try {
      const { data: siblings } = await supabase
        .from("laptop_units")
        .select("status, so_at, msj_group_id")
        .eq("laptop_id", current.laptop_id);

      const aktif = (siblings ?? []).filter(
        (u) => u.status !== "SOLD" && u.status !== "KELUAR" && !u.msj_group_id
      );
      // Semua unit aktif sudah di-SO (so_at terisi) → naikkan status ke parent.
      // Tanpa cek tanggal karena reset sekarang manual, bukan periodik.
      const allSo = aktif.length > 0 && aktif.every((u) => u.so_at != null);

      await supabase
        .from("laptops")
        .update(
          allSo
            ? { so_at: new Date().toISOString(), so_by: user.name }
            : { so_at: null, so_by: null }
        )
        .eq("id", current.laptop_id);
    } catch {
      // Rollup gagal TIDAK membatalkan SO unit yang sudah sukses — unit tetap
      // tersimpan, cuma tanda di baris model yang mungkin telat ter-update.
    }

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