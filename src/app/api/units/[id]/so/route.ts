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

    // Setelah Reset SO jadi MANUAL, PATCH ini SELALU set/refresh so_at —
    // TIDAK pernah toggle off ke null. Alasannya: tombol di UI sekarang
    // bermakna "Tandai SO" (kalau belum) atau "SO Ulang" (kalau sudah),
    // keduanya menghasilkan status "Sudah SO" dengan timestamp terbaru.
    // Pengosongan so_at (undo per-unit) sekarang hanya dilakukan lewat
    // tombol Reset SO manual di halaman Data Barang (POST /api/so/reset).
    const wasAlreadySo = current.so_at != null;

    const nowIso = new Date().toISOString();
    const payload = { so_at: nowIso, so_by: user.name };

    const { data, error } = await supabase
      .from("laptop_units")
      .update(payload)
      .eq("id", id)
      .select("id, so_at, so_by")
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Action label disamakan dengan niat user — "SO Ulang" kalau sebelumnya
    // sudah SO, "SO" kalau baru pertama kali. Keduanya BUKAN "UNSO" karena
    // operasinya selalu set, bukan clear.
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "SO",
      entity: "unit",
      entityId: id,
      entityLabel: `SN: ${current.serial_number}`,
      reason: wasAlreadySo
        ? (notes ? `${notes} (SO Ulang)` : "SO Ulang")
        : (notes || null),
    });

    await supabase.from("laptop_unit_so_logs").insert({
      unit_id: id,
      action: "SO",
      so_by: user.name,
      so_at: nowIso,
      notes: wasAlreadySo
        ? (notes ? `${notes} (SO Ulang)` : "SO Ulang")
        : (notes || null),
    });

    // ── ROLLUP ke parent laptops.so_at ──────────────────────────────────
    // ✅ FIX: filter "aktif" DISAMAKAN dengan OUT_STATUSES di frontend
    // (UnifiedBarangContent.tsx). Dulu di sini cuma exclude SOLD/KELUAR —
    // unit RESERVED/HELD/PACKING/PENDING masih ikut dihitung "aktif" padahal
    // di Data Barang mereka sudah exclude dari unit_count. Akibatnya: model
    // dengan 1 unit SIAP_JUAL + 1 unit RESERVED → user SO unit SIAP_JUAL →
    // rollup backend hitung aktif = 2 → allSo false → parent tidak update →
    // Data Barang (yang baca laptops.so_at) tampil "Belum SO" ❌.
    const OUT_STATUSES_ROLLUP = new Set([
      "SOLD", "TERJUAL", "KELUAR", "RETURNED", "RESERVED", "HELD", "PACKING", "PENDING",
    ]);
    try {
      const { data: siblings } = await supabase
        .from("laptop_units")
        .select("status, so_at, msj_group_id")
        .eq("laptop_id", current.laptop_id);

      const aktif = (siblings ?? []).filter(
        (u) => !OUT_STATUSES_ROLLUP.has(u.status) && !u.msj_group_id
      );
      const allSo = aktif.length > 0 && aktif.every((u) => u.so_at != null);

      if (allSo) {
        await supabase
          .from("laptops")
          .update({ so_at: nowIso, so_by: user.name })
          .eq("id", current.laptop_id);
      }
    } catch {
      // Rollup gagal TIDAK membatalkan SO unit yang sudah sukses.
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