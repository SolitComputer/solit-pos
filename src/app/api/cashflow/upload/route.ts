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

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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
    if (!ALLOWED_TYPES.includes(file.type))
        return NextResponse.json({ success: false, message: "Format file tidak didukung (JPG/PNG/WEBP)" }, { status: 400 });
    if (file.size > MAX_SIZE_BYTES)
        return NextResponse.json({ success: false, message: "Ukuran file maksimal 5MB" }, { status: 400 });

    const supabase = getAdmin();

    // Generate unique filename
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const jakartaDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const filename = `${jakartaDate}/${user.id}_${Date.now()}.${ext}`;

    // Convert File → ArrayBuffer → Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await supabase.storage
        .from("cashflow-photos")
        .upload(filename, buffer, {
            contentType: file.type,
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