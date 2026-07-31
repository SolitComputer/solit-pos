import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { clearExpiredStoryFields } from "@/lib/expireStories";
import bcrypt from "bcryptjs";

const FULL_ACCESS_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);

function isFullAccess(roles: string[]): boolean {
  return roles.some(r => FULL_ACCESS_ROLES.has(r));
}

// ── Helper hapus foto profil dari storage saat akun dihapus total ──────────
const AVATAR_BUCKET = "avatars";
function extractAvatarPath(publicUrl: string): string | null {
  const marker = `/${AVATAR_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
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

  // Anotasi ": string" WAJIB ada di sini — tanpa ini TypeScript menganggap
  // selectFields sebagai union 3 string literal raksasa, dan supabase-js coba
  // parsing tiap literalnya untuk infer bentuk hasil query. Untuk select-string
  // sepanjang ini, compiler jadi "meledak" — persis error build tadi.
  const selectFields: string = isAdmin
    ? "id, name, phone_number, email, role, roles, shift, password_set, face_enrolled_at, face_embedding, force_logout_at, created_at, birth_date, profile_photo_url, bio, status_note, status_note_expires_at, song_title, song_artist, song_artwork_url, song_preview_url, song_clip_start, song_expires_at, biometric_enabled"
    : isKepala
      ? "id, name, phone_number, role, roles, shift, birth_date, profile_photo_url, bio, status_note, status_note_expires_at, song_title, song_artist, song_artwork_url, song_preview_url, song_clip_start, song_expires_at"
      : "id, name, role, roles, birth_date, profile_photo_url, bio, status_note, status_note_expires_at, song_title, song_artist, song_artwork_url, song_preview_url, song_clip_start, song_expires_at";

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(selectFields)
    .order("role")
    .order("name");

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Set user_id yang sudah punya kredensial WebAuthn tersimpan — buat bedain
  // "diaktifkan tapi belum daftar" vs "sudah terdaftar beneran"
  let enrolledBiometricIds = new Set<string>();
  if (isAdmin) {
    const { data: credRows } = await supabaseAdmin
      .from("user_webauthn_credentials")
      .select("user_id");
    enrolledBiometricIds = new Set((credRows ?? []).map((c: any) => c.user_id));
  }

  // Catatan/lagu yang sudah lewat 24 jam beneran dibersihkan dari database
  // di sini (bukan cuma disembunyikan di response) — sama seperti GET /api/profile.
  const expiryResults = await Promise.all(
    (data ?? []).map((u: any) => clearExpiredStoryFields(supabaseAdmin, u))
  );

  const users = (data ?? []).map((u: any, i: number) => {
    const { noteExpired, songExpired } = expiryResults[i];
    return {
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
      biometric_enabled: isAdmin ? (u.biometric_enabled ?? false) : false,
      biometric_enrolled: isAdmin ? enrolledBiometricIds.has(u.id) : false,
      phone_number: (isAdmin || isKepala) ? (u.phone_number ?? null) : null,
      email: isAdmin ? (u.email ?? null) : null,
      birth_date: u.birth_date ?? null,
      status_note: noteExpired ? null : (u.status_note ?? null),
      status_note_expires_at: noteExpired ? null : (u.status_note_expires_at ?? null),
      song_title: songExpired ? null : (u.song_title ?? null),
      song_artist: songExpired ? null : (u.song_artist ?? null),
      song_artwork_url: songExpired ? null : (u.song_artwork_url ?? null),
      song_preview_url: songExpired ? null : (u.song_preview_url ?? null),
      song_clip_start: songExpired ? 0 : (u.song_clip_start ?? 0),
      song_expires_at: songExpired ? null : (u.song_expires_at ?? null),
    };
  });

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
    _toggleBiometric,
    _resetBiometric,
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

  // ── Handle toggle eligibility sidik jari/biometrik ─────────────────────────
  if (typeof _toggleBiometric === "boolean") {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ biometric_enabled: _toggleBiometric })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      message: _toggleBiometric
        ? "Sidik jari diaktifkan — user akan diminta daftar di HP-nya"
        : "Sidik jari dinonaktifkan",
    });
  }

  // ── Handle reset kredensial sidik jari/biometrik ───────────────────────────
  if (_resetBiometric === true) {
    const { error } = await supabaseAdmin
      .from("user_webauthn_credentials")
      .delete()
      .eq("user_id", id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Kredensial sidik jari berhasil direset" });
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

  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("profile_photo_url")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("users").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const oldAvatarPath = existingUser?.profile_photo_url ? extractAvatarPath(existingUser.profile_photo_url) : null;
  if (oldAvatarPath) {
    await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([oldAvatarPath]);
  }

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PUT = withAuth(putHandler);
export const DELETE = withAuth(deleteHandler);