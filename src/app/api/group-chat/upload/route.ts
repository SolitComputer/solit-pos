// src/app/api/group-chat/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // dinaikin ke 10MB biar VN aman
const BUCKET = "chat-attachments";

const AUDIO_EXT_MIME: Record<string, string> = {
    webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/mp4",
    mp4: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav",
};

function resolveContentType(fileType: string, fileName: string): string {
    if (fileType && (fileType.startsWith("audio/") || fileType.startsWith("image/"))) return fileType;
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_EXT_MIME[ext]) return AUDIO_EXT_MIME[ext];
    return fileType || "application/octet-stream";
}

function detectAttachmentType(fileType: string, fileName: string): "image" | "voice" | "file" {
    const name = fileName.toLowerCase();
    if (fileType.startsWith("image/")) return "image";
    if (fileType.startsWith("audio/")) return "voice";
    if ([".webm", ".ogg", ".m4a", ".mp3", ".wav", ".mp4"].some(e => name.endsWith(e))) return "voice";
    if (name.startsWith("voice_")) return "voice";
    return "file";
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let formData: FormData;
    try { formData = await req.formData(); }
    catch { return NextResponse.json({ success: false, message: "Form data tidak valid" }, { status: 400 }); }

    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, message: "File wajib diupload" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ success: false, message: "Ukuran file maksimal 10MB" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, message: "File tidak boleh kosong" }, { status: 400 });

    const attachmentType = detectAttachmentType(file.type, file.name);
    const contentType = resolveContentType(file.type, file.name);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = attachmentType === "voice" ? "group-voice" : "group";
    const path = `${folder}/${user.id}/${Date.now()}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType, upsert: false });

    if (error) {
        console.error("[upload group-chat]", error.message);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(data.path);

    return NextResponse.json({
        success: true,
        url: urlData.publicUrl,
        type: attachmentType,
        name: file.name,
        size: file.size,
    });
}

export const POST = withAuth(postHandler);