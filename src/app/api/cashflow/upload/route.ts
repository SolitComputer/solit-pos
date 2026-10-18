// src/app/api/cashflow/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { CASHFLOW_ROLES } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — foto kamera HP modern sering >5MB

// ⬅️ FIX: foto dari kamera langsung (input capture="environment") sering dikirim
// browser dengan file.type KOSONG ("") atau non-standar ("image/jpg"), beda
// dengan file dari galeri yang metadata MIME-nya lengkap. Kalau cuma dicek
// ALLOWED_TYPES.includes(file.type) seperti sebelumnya, foto kamera SELALU
// ditolak walau filenya valid. Sekarang fallback ke ekstensi nama file kalau
// MIME type tidak dikenali/kosong.
function resolveContentType(fileType: string, ext: string): string | null {
    const normalized = fileType === "image/jpg" ? "image/jpeg" : fileType;
    if (ALLOWED_TYPES.includes(normalized)) return normalized;

    const extToMime: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        webp: "image/webp", heic: "image/heic", heif: "image/heif",
    };
    if (ALLOWED_EXTENSIONS.includes(ext)) return extToMime[ext];

    // ⬅️ FIX BARU: sebagian browser/WebView (terutama saat foto diambil LANGSUNG
    // dari kamera) mengirim file tanpa MIME type ("") DAN tanpa nama file yang
    // punya ekstensi sama sekali (mis. "image", "blob", timestamp mentah tanpa
    // titik). Fix lama di atas cuma menutup celah MIME kosong, belum menutup
    // celah nama file tanpa ekstensi ini — jadi foto valid dari kamera masih
    // bisa ke-reject. Kalau MIME type kosong atau minimal masih "image/*",
    // anggap saja JPEG (hampir semua kamera HP/browser default JPEG).
    if (!fileType || fileType.startsWith("image/")) return "image/jpeg";

    return null;
}

export async function POST(req: NextRequest) {
    // Auth
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const roles: string[] = Array.isArray(user?.roles) && user.roles.length
        ? user.roles : [user?.role].filter(Boolean);
    if (!roles.some((r) => (CASHFLOW_ROLES as string[]).includes(r)))
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

        if (!file) return NextResponse.json({ success: false, message: "File tidak ditemukan" }, { status: 400 });

    // ⬅️ FIX: dulu `file.name.split(".").pop()` dianggap ekstensi apa adanya —
    // kalau nama file TIDAK punya titik sama sekali (umum utk foto kamera dari
    // WebView), hasilnya adalah SELURUH nama file, bukan string kosong, jadi
    // fallback `|| "jpg"` di baris lama tidak pernah kepakai. Sekarang dicek
    // dulu apakah ada titiknya; kalau tidak ada, langsung anggap tanpa ekstensi.
    const rawExt = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
    const ext = rawExt || "jpg";
    const contentType = resolveContentType(file.type, ext);
    if (!contentType)
        return NextResponse.json({ success: false, message: "Format file tidak didukung (JPG/PNG/WEBP)" }, { status: 400 });
    if (file.size > MAX_SIZE_BYTES)
        return NextResponse.json({ success: false, message: "Ukuran file maksimal 8MB" }, { status: 400 });

    const supabase = getAdmin();

    // Generate unique filename
    const jakartaDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const filename = `${jakartaDate}/${user.id}_${Date.now()}.${ext}`;

    // Convert File → ArrayBuffer → Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabase.storage
        .from("cashflow-photos")
        .upload(filename, buffer, {
            contentType, // ⬅️ FIX: dulu pakai file.type mentah — kalau kosong (kasus kamera),
            // object di Supabase Storage tersimpan tanpa content-type yang benar,
            // sehingga foto berisiko tidak ter-render sebagai gambar saat dibuka.
            upsert: false,
        });

    if (error) {
        console.error("[cashflow upload]", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from("cashflow-photos")
        .getPublicUrl(filename);

    return NextResponse.json({ success: true, url: urlData.publicUrl }, { status: 201 });
}