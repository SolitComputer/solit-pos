// src/app/api/messages/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const runtime = "nodejs";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const BUCKET = "chat-attachments"; // Bucket yang sama dengan group chat

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ success: false, message: "Form data tidak valid" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) {
        return NextResponse.json({ success: false, message: "File wajib diupload" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
        return NextResponse.json({ success: false, message: "Ukuran file maksimal 5MB" }, { status: 400 });
    }
    if (file.size === 0) {
        return NextResponse.json({ success: false, message: "File tidak boleh kosong" }, { status: 400 });
    }

    const isImage = file.type.startsWith("image/");
    const attachmentType = isImage ? "image" : "file";

    // Path: dm/{senderId}/{timestamp}_{filename} — pisah dari group chat
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `dm/${user.id}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
        });

    if (error) {
        console.error("[upload DM]", error.message);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
        .from(BUCKET)
        .getPublicUrl(data.path);

    console.log("[upload DM] uploaded:", data.path, "by:", user.name);

    return NextResponse.json({
        success: true,
        url: urlData.publicUrl,
        type: attachmentType,
        name: file.name,
        size: file.size,
    });
}

export const POST = withAuth(postHandler);