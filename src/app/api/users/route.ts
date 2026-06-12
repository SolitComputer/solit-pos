import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import bcrypt from "bcryptjs";

const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);

function isFullAccess(role: string): boolean {
  return FULL_ACCESS_ROLES.has(role);
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(
      "id, name, phone_number, email, role, shift, password_set, face_enrolled_at, face_embedding, force_logout_at, created_at"
    )
    .order("role")
    .order("name");

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const users = (data ?? []).map((u: any) => ({
    ...u,
    shift: u.shift ?? "PAGI",
    password_set: u.password_set ?? false,
    face_embedding: u.face_embedding !== null && u.face_embedding !== undefined,
    // ✅ Include force_logout_at untuk UI tahu apakah user ini sedang "force-logged-out"
    force_logout_at: u.force_logout_at ?? null,
  }));

  return NextResponse.json({ success: true, users });
}

// ── POST — buat user baru ──────────────────────────────────────────────────
async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const body = await req.json();
  const { name, phone_number, role, shift = "PAGI" } = body;

  if (!name || !phone_number || !role) {
    return NextResponse.json(
      { success: false, message: "Nama, nomor WA, dan role wajib diisi" },
      { status: 400 }
    );
  }

  const normalizedPhone = normalizePhone(String(phone_number));

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("phone_number", normalizedPhone)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: false, message: "Nomor WA sudah terdaftar" },
      { status: 409 }
    );
  }

  const tempPassword = await bcrypt.hash(`temp_${Date.now()}`, 10);

  const { data: newUser, error } = await supabaseAdmin
    .from("users")
    .insert({
      name,
      phone_number: normalizedPhone,
      role,
      shift,
      password: tempPassword,
      password_set: false,
      created_by: user.id,
    })
    .select("id, name, phone_number, role, shift, password_set")
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, user: newUser });
}

// ── PUT — update user (edit, reset password, force logout) ────────────────
async function putHandler(req: NextRequest, ctx: any, currentUser: AuthUser) {
  if (!isFullAccess(currentUser.role)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const { id, name, phone_number, role, shift, _resetPassword, _forceLogout } = body;

  if (!id) {
    return NextResponse.json({ success: false, message: "ID user wajib" }, { status: 400 });
  }

  // ── ✅ NEW: Handle force logout ────────────────────────────────────────────
  if (_forceLogout === true) {
    if (id === currentUser.id) {
      return NextResponse.json(
        { success: false, message: "Gunakan logout biasa untuk akun sendiri" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ force_logout_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[force-logout] DB error:", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    console.log(
      `[force-logout] Admin ${currentUser.name} force-logout user ${id}`
    );

    return NextResponse.json({
      success: true,
      message: "Session user berhasil di-logout. Akan diaplikasikan saat user reload halaman.",
    });
  }

  // ── Handle reset password ──────────────────────────────────────────────────
  if (_resetPassword === true) {
    const tempPassword = await bcrypt.hash(`reset_${Date.now()}`, 10);
    const { error } = await supabaseAdmin
      .from("users")
      .update({ password: tempPassword, password_set: false })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Password berhasil direset" });
  }

  // ── Handle regular update ──────────────────────────────────────────────────
  const updates: Record<string, any> = {};

  if (name !== undefined && name !== null) updates.name = name;
  if (role !== undefined && role !== null) updates.role = role;
  if (shift !== undefined && shift !== null) updates.shift = shift;
  if (phone_number !== undefined && phone_number !== null && phone_number !== "") {
    updates.phone_number = normalizePhone(String(phone_number));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, message: "Tidak ada field yang diupdate" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("id", id)
    .select("id, name, phone_number, role, shift")
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, user: data });
}

// ── DELETE — hapus user ────────────────────────────────────────────────────
async function deleteHandler(req: NextRequest, ctx: any, currentUser: AuthUser) {
  if (!isFullAccess(currentUser.role)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, message: "ID user wajib" }, { status: 400 });
  }

  if (id === currentUser.id) {
    return NextResponse.json(
      { success: false, message: "Tidak bisa menghapus akun sendiri" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("users").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const GET    = withAuth(getHandler);
export const POST   = withAuth(postHandler);
export const PUT    = withAuth(putHandler);
export const DELETE = withAuth(deleteHandler);