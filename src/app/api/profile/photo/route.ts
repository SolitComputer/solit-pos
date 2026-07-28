import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";

const PHOTO_ADMIN_ROLES = new Set(["ADMIN", "PROGRAMMER", "ASISTEN_CEO"]);
function canManagePhoto(user: AuthUser): boolean {
  const roles: string[] = (user as any).roles ?? [user.role];
  return roles.some((r) => PHOTO_ADMIN_ROLES.has(r));
}
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = "avatars";
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB — client wajib kompres dulu
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function extractPath(publicUrl: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const form = await req.formData();
  const targetId = (form.get("user_id") as string | null) ?? user.id;

  // Admin boleh ganti foto siapa saja; user biasa hanya boleh foto sendiri.
  if (targetId !== user.id && !canManagePhoto(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const file = form.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ success: false, message: "File wajib diisi" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ success: false, message: "Format harus JPG, PNG, atau WEBP" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ success: false, message: "Ukuran file maksimal 3MB" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("users")
    .select("profile_photo_url")
    .eq("id", targetId)
    .maybeSingle();

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${targetId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ success: false, message: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const photoUrl = publicUrlData.publicUrl;

  const { error: updateError } = await supabase
    .from("users")
    .update({ profile_photo_url: photoUrl, photo_updated_at: new Date().toISOString() })
    .eq("id", targetId);

  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path]); // rollback file kalau update DB gagal
    return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
  }

  // Bersihkan foto lama supaya storage tidak menumpuk
  const oldPath = existing?.profile_photo_url ? extractPath(existing.profile_photo_url) : null;
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);

  return NextResponse.json({ success: true, data: { profile_photo_url: photoUrl } });
}

async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  const body = await req.json().catch(() => ({}));
  const targetId: string = body.user_id ?? user.id;

  if (targetId !== user.id && !canManagePhoto(user)) {
    return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("users")
    .select("profile_photo_url")
    .eq("id", targetId)
    .maybeSingle();

  const oldPath = existing?.profile_photo_url ? extractPath(existing.profile_photo_url) : null;
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);

  const { error } = await supabase
    .from("users")
    .update({ profile_photo_url: null, photo_updated_at: new Date().toISOString() })
    .eq("id", targetId);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);