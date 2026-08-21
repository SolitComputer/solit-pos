// src/app/api/settings/photo/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_ROLES, AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const BUCKET = "site-assets";

// GET /api/settings/photo?key=akutansi_companion_photo — ambil URL foto custom yang lagi aktif
export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";

  if (!key)
    return NextResponse.json({ success: false, message: "Key wajib diisi" }, { status: 400 });

  const supabase = getAdmin();
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error("[settings/photo GET]", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: data?.value ?? null });
}, AKUNTANSI_ROLES);

// POST /api/settings/photo — upload foto baru (multipart/form-data: key, file)
export const POST = withAuth(async (req, _ctx, user: any) => {
  const form = await req.formData();
  const key = form.get("key") as string | null;
  const file = form.get("file") as File | null;

  if (!key)
    return NextResponse.json({ success: false, message: "Key wajib diisi" }, { status: 400 });
  if (!file)
    return NextResponse.json({ success: false, message: "File wajib diupload" }, { status: 400 });
  // ✅ FIX: "image/*" mencakup image/svg+xml — SVG bisa berisi <script> yang
  // jalan kalau dibuka langsung dari bucket publik. Dipersempit ke raster.
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return NextResponse.json({ success: false, message: "File harus berupa gambar JPG/PNG/WEBP" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ success: false, message: "Ukuran gambar maksimal 5MB" }, { status: 400 });

  const supabase = getAdmin();

  // Nama file pakai timestamp supaya selalu unik → browser/CDN tidak nyangkut di cache foto lama
  const ext = file.name.split(".").pop() || "png";
  const path = `${key}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadErr) {
    console.error("[settings/photo POST upload]", uploadErr);
    return NextResponse.json({ success: false, message: uploadErr.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: dbErr } = await supabase
    .from("site_settings")
    .upsert({ key, value: pub.publicUrl, updated_at: new Date().toISOString(), updated_by: user.id });

  if (dbErr) {
    console.error("[settings/photo POST db]", dbErr);
    return NextResponse.json({ success: false, message: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: pub.publicUrl });
}, AKUNTANSI_MANAGE_ROLES);