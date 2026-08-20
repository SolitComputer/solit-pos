import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/auth";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// ✅ SECURITY FIX: dulu route ini tidak lewat middleware & tanpa auth, dan
// `invoice` dari body dipakai mentah jadi path storage (`receipts/${invoice}.jpg`)
// dengan upsert:true — siapa pun bisa menimpa bukti bayar invoice yang sah atau
// membanjiri storage. Sekarang: wajib login + validasi tipe/ukuran file +
// sanitasi nama invoice supaya tidak bisa keluar dari folder (path traversal).
export const POST = withAuth(async (req: NextRequest) => {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const invoiceRaw = formData.get("invoice") as string;

        if (!file || !invoiceRaw) {
            return NextResponse.json({ error: "Missing file or invoice" }, { status: 400 });
        }

        // Hanya izinkan karakter aman untuk nomor invoice (cegah `../` / path traversal).
        const invoice = invoiceRaw.replace(/[^a-zA-Z0-9._-]/g, "");
        if (!invoice) {
            return NextResponse.json({ error: "Invoice tidak valid" }, { status: 400 });
        }

        if (!ALLOWED_MIME.includes(file.type)) {
            return NextResponse.json({ error: "Tipe file tidak didukung (harus JPG/PNG/WebP)" }, { status: 400 });
        }
        if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json({ error: "Ukuran file tidak valid (maks 8MB)" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fileName = `receipts/${invoice}.jpg`;

        const { error } = await supabase.storage
            .from("payment-proof")
            .upload(fileName, buffer, {
                contentType: "image/jpeg",
                upsert: true, 
            });

        if (error) {
            console.error("Upload error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const { data: urlData } = supabase.storage
            .from("payment-proof")
            .getPublicUrl(fileName);

        return NextResponse.json({ url: urlData.publicUrl });
    } catch (err) {
        console.error("upload-image error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
});