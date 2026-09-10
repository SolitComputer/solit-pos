import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

// ✅ Paksa Node runtime — handler ini pakai Buffer (tidak ada di Edge).
export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "mission-proofs";
const MAX_SIZE = 4 * 1024 * 1024; // 4MB — aman di bawah limit body Vercel (~4.5MB)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"];

// Cache per-instance (Vercel warm) biar tidak cek bucket tiap request.
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;

  // getBucket balikin { data, error }. Kalau service key salah/kosong,
  // error di sini yang paling dulu kelihatan — jangan ditelan.
  const { data, error: getErr } = await supabaseAdmin.storage.getBucket(BUCKET);

  if (getErr && !/not found|does not exist/i.test(getErr.message)) {
    // Error selain "bucket tidak ada" = biasanya auth/permission service key.
    throw new Error(`Gagal cek bucket: ${getErr.message}`);
  }

  if (!data) {
    const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: true,          // biar getPublicUrl bisa diakses langsung
      fileSizeLimit: MAX_SIZE,
    });
    // Abaikan race "already exists" (2 request cold start barengan).
    if (createErr && !/exists/i.test(createErr.message)) {
      throw new Error(`Gagal menyiapkan bucket: ${createErr.message}`);
    }
  }

  bucketReady = true; // hanya set kalau benar-benar sudah siap
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  // ✅ Payung try/catch: apapun yang gagal (formData korup, dsb),
  //    respons tetap JSON — client tidak akan dapat "Terjadi kesalahan" generic.
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { success: false, message: "Data upload tidak terbaca. Coba ulangi." },
        { status: 400 }
      );
    }

    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, message: "File tidak ditemukan" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    // ✅ Validasi tipe: cek MIME, tapi kalau MIME kosong (sering di HP)
    //    fallback ke ekstensi. "image/*" sengaja TIDAK dipakai supaya
    //    image/svg+xml (bisa berisi <script>) tetap ditolak.
    const typeOk = file.type ? ALLOWED_TYPES.includes(file.type) : ALLOWED_EXT.includes(ext);
    if (!typeOk) {
      return NextResponse.json(
        { success: false, message: "File harus berupa gambar JPG/PNG/WEBP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, message: "Ukuran maksimal 4MB. Coba foto ulang / kompres dulu." },
        { status: 400 }
      );
    }

    // ✅ Pastikan bucket ada dulu (auto-create kalau belum).
    try {
      await ensureBucket();
    } catch (e: any) {
      console.error("[missions/upload ensureBucket]", e);
      return NextResponse.json(
        { success: false, message: e?.message ?? "Bucket gagal disiapkan" },
        { status: 500 }
      );
    }

    const safeExt = ALLOWED_EXT.includes(ext) ? ext : "jpg";
    const path = `${user.id}/${Date.now()}.${safeExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (upErr) {
      console.error("[missions/upload]", upErr);
      return NextResponse.json({ success: false, message: upErr.message }, { status: 500 });
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: pub.publicUrl });
  } catch (e: any) {
    // Jaring terakhir — apapun exception yang lolos, tetap balikin JSON.
    console.error("[missions/upload fatal]", e);
    return NextResponse.json(
      { success: false, message: e?.message ?? "Terjadi kesalahan di server" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(postHandler);