import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { DATA_BARANG_LAPTOP_ROLES, BARANG_FULL_ACCESS_ROLES, hasAnyRole } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

// Normalisasi input tipe kategori → 'LAPTOP' | 'AKSESORIS' | null.
function normalizeType(v: unknown): "LAPTOP" | "AKSESORIS" | null {
  const t = String(v ?? "").toUpperCase();
  return t === "LAPTOP" || t === "AKSESORIS" ? t : null;
}

// GET: daftar kategori — dipakai tab Kategori & dropdown Tambah/Edit barang.
// Query opsional ?type=LAPTOP|AKSESORIS untuk memisahkan kategori laptop vs aksesoris.
// Transition-safe: kalau kolom `type` belum ada (migrasi belum dijalankan) atau
// baris belum di-set type-nya, kategori tetap muncul di kedua tipe — persis
// perilaku lama, jadi tidak ada regresi sebelum SQL migrasi dijalankan.
async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const wantType = normalizeType(new URL(req.url).searchParams.get("type"));
    const list = wantType
      ? (data ?? []).filter((c: { type?: string | null }) => !c.type || c.type === wantType)
      : data;

    return NextResponse.json({ success: true, data: list });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// POST: tambah kategori baru
async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(user.roles ?? [user.role], BARANG_FULL_ACCESS_ROLES)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ success: false, message: "Nama kategori wajib diisi" }, { status: 400 });
    }

    const type = normalizeType(body.type) ?? "AKSESORIS";
    const basePayload = {
      name,
      description: body.description?.trim() || null,
      created_by: user.name,
    };

    let { data, error } = await supabase
      .from("laptop_categories")
      .insert({ ...basePayload, type })
      .select()
      .single();

    // Kolom `type` belum ada (migrasi belum dijalankan) → ulangi tanpa type.
    if (error?.code === "42703") {
      ({ data, error } = await supabase
        .from("laptop_categories")
        .insert(basePayload)
        .select()
        .single());
    }

    if (error) {
      // Kode 23505 = unique violation (nama kategori sudah ada)
      const message = error.code === "23505" ? `Kategori "${name}" sudah ada` : error.message;
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "CREATE",
      entity: "laptop_category",
      entityId: data.id,
      entityLabel: data.name,
      afterData: data,
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, message: "Gagal menambahkan kategori" }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, DATA_BARANG_LAPTOP_ROLES);
export const POST = withAuth(postHandler);