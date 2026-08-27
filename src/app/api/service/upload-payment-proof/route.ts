import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { SERVICE_VIEW_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const BUCKET = "payment-proofs";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const POST = withAuth(async (req, _ctx, user) => {
  const formData = await req.formData();
  const file = formData.get("file");
  const orderId = formData.get("order_id");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "File wajib diupload" }, { status: 400 });
  }
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ success: false, message: "order_id wajib diisi" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ success: false, message: "Format file harus JPG, PNG, atau WEBP" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ success: false, message: "Ukuran file maksimal 5MB" }, { status: 400 });
  }

  const supabase = getAdmin();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${orderId}/${Date.now()}-${user.id}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error("[upload-payment-proof]", uploadErr);
    const isMissingBucket = uploadErr.message?.toLowerCase().includes("bucket not found");
    return NextResponse.json(
      {
        success: false,
        message: isMissingBucket
          ? `Storage bucket "${BUCKET}" belum dibuat di Supabase. Hubungi admin untuk setup bucket.`
          : uploadErr.message,
      },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json(
    { success: true, data: { url: publicUrlData.publicUrl, path } },
    { status: 201 }
  );
}, SERVICE_VIEW_ROLES);