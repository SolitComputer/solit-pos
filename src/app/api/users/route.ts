import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import bcrypt from "bcryptjs";

const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);

function isFullAccess(roles: string[]): boolean {
  return roles.some(r => FULL_ACCESS_ROLES.has(r));
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

// ── GET — ambil semua user ─────────────────────────────────────────────────
async function getHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const userRoles: string[] = user.roles ?? [user.role];

  const FULL_ACCESS_SET = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);
  const KEPALA_SET = new Set([
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ]);

  const isAdmin = userRoles.some(r => FULL_ACCESS_SET.has(r));
  const isKepala = !isAdmin && userRoles.some(r => KEPALA_SET.has(r));

  const selectFields = isAdmin
    ? "id, name, phone_number, email, role, roles, shift, password_set, face_enrolled_at, face_embedding, force_logout_at, created_at, birth_date, profile_photo_url, bio, status_note, status_note_expires_at, song_title, song_artist, song_artwork_url"
    : isKepala
      ? "id, name, phone_number, role, roles, shift, birth_date, profile_photo_url, bio, status_note, status_note_expires_at, song_title, song_artist, song_artwork_url"
      : "id, name, role, roles, birth_date, profile_photo_url, bio, status_note, status_note_expires_at, song_title, song_artist, song_artwork_url";

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(selectFields)
    .order("role")
    .order("name");

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const users = (data ?? []).map((u: any) => ({
    ...u,
    roles: Array.isArray(u.roles) && u.roles.length > 0
      ? u.roles
      : [u.role].filter(Boolean),
    shift: u.shift ?? "PAGI",
    password_set: isAdmin ? (u.password_set ?? false) : false,
    face_embedding: isAdmin
      ? (u.face_embedding !== null && u.face_embedding !== undefined)
      : false,
    force_logout_at: isAdmin ? (u.force_logout_at ?? null) : null,
    phone_number: (isAdmin || isKepala) ? (u.phone_number ?? null) : null,
    email: isAdmin ? (u.email ?? null) : null,
    birth_date: u.birth_date ?? null,
    status_note: (u.status_note_expires_at && new Date(u.status_note_expires_at) < new Date())
      ? null
      : (u.status_note ?? null),
  }));

  return NextResponse.json({ success: true, users });
}

// ── POST — buat user baru ──────────────────────────────────────────────────
async function postHandler(req: NextRequest, ctx: any, user: AuthUser) {
  const userRoles: string[] = user.roles ?? [user.role];
  if (!isFullAccess(userRoles)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const body = await req.json();
  const { name, phone_number, roles: inputRoles, role: inputRole, shift = "PAGI", birth_date } = body;

  // Support input roles array ATAU role tunggal (backward compat)
  const rolesArray: string[] = Array.isArray(inputRoles) && inputRoles.length > 0
    ? inputRoles
    : inputRole
      ? [inputRole]
      : [];

  if (!name || !phone_number || rolesArray.length === 0) {
    return NextResponse.json(
      { success: false, message: "Nama, nomor WA, dan minimal 1 role wajib diisi" },
      { status: 400 }
    );
  }

  const primaryRole = rolesArray[0];
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
      role: primaryRole,      // primary role (kolom lama)
      roles: rolesArray,      // semua roles (kolom baru)
      shift,
      password: tempPassword,
      password_set: false,
      created_by: user.id,
      birth_date: birth_date || null,
    })
    .select("id, name, phone_number, role, roles, shift, password_set, birth_date")
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, user: newUser });
}

// ── PUT — update user ──────────────────────────────────────────────────────
async function putHandler(req: NextRequest, ctx: any, currentUser: AuthUser) {
  const currentUserRoles: string[] = currentUser.roles ?? [currentUser.role];
  if (!isFullAccess(currentUserRoles)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const {
    id,
    name,
    phone_number,
    roles: inputRoles,
    role: inputRole,
    shift,
    birth_date,
    _resetPassword,
    _forceLogout,
  } = body;

  if (!id) {
    return NextResponse.json({ success: false, message: "ID user wajib" }, { status: 400 });
  }

  // ── Handle force logout ────────────────────────────────────────────────────
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
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      message: "Session user berhasil di-logout.",
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
  if (shift !== undefined && shift !== null) updates.shift = shift;

  // Update roles — support array atau string tunggal
  const rolesArray: string[] | null =
    Array.isArray(inputRoles) && inputRoles.length > 0
      ? inputRoles
      : inputRole
        ? [inputRole]
        : null;

  if (rolesArray !== null) {
    updates.roles = rolesArray;
    updates.role = rolesArray[0]; // sync primary role
  }

  if (birth_date !== undefined) updates.birth_date = birth_date || null;
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
    .select("id, name, phone_number, role, roles, shift, birth_date")
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, user: data });
}

// ── DELETE — hapus user ────────────────────────────────────────────────────
async function deleteHandler(req: NextRequest, ctx: any, currentUser: AuthUser) {
  const currentUserRoles: string[] = currentUser.roles ?? [currentUser.role];
  if (!isFullAccess(currentUserRoles)) {
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

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PUT = withAuth(putHandler);
export const DELETE = withAuth(deleteHandler);