// src/app/api/messages/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { supabaseAdmin } from "@/services/supabaseAdmin";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024;
const BUCKET = "chat-attachments";

// Map ekstensi → MIME yang valid untuk audio
const AUDIO_EXT_MIME: Record<string, string> = {
    webm: "audio/webm",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
};

/**
 * Resolve content-type yang benar.
 * Browser kadang tidak set MIME saat append Blob ke FormData,
 * sehingga file.type bisa kosong / "application/octet-stream".
 */
function resolveContentType(fileType: string, fileName: string): string {
    // Kalau browser sudah kasih MIME audio yang valid → pakai itu
    if (fileType && fileType.startsWith("audio/")) return fileType;
    if (fileType && fileType.startsWith("image/")) return fileType;

    // Fallback: deteksi dari ekstensi file
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (AUDIO_EXT_MIME[ext]) return AUDIO_EXT_MIME[ext];

    // Fallback terakhir
    return fileType || "application/octet-stream";
}

/**
 * Deteksi tipe attachment.
 * Cek MIME dulu, lalu ekstensi, lalu prefix nama file (voice_).
 */
function detectAttachmentType(fileType: string, fileName: string): "image" | "voice" | "file" {
    const name = fileName.toLowerCase();

    if (fileType.startsWith("image/")) return "image";
    if (fileType.startsWith("audio/")) return "voice";

    // Cek ekstensi audio
    const audioExts = [".webm", ".ogg", ".m4a", ".mp3", ".wav", ".mp4"];
    if (audioExts.some(ext => name.endsWith(ext))) return "voice";

    // VoiceRecorder selalu prefix nama dengan "voice_"
    if (name.startsWith("voice_")) return "voice";

    return "file";
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ success: false, message: "Form data tidak valid" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, message: "File wajib diupload" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ success: false, message: "Ukuran file maksimal 10MB" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, message: "File tidak boleh kosong" }, { status: 400 });

    // Log untuk debug — hapus setelah confirmed fix
    console.log("[upload] file.type:", file.type, "| file.name:", file.name, "| size:", file.size);

    const attachmentType = detectAttachmentType(file.type, file.name);
    const contentType = resolveContentType(file.type, file.name);

    console.log("[upload] resolved contentType:", contentType, "| attachmentType:", attachmentType);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = attachmentType === "voice" ? "voice" : "dm";
    const path = `${folder}/${user.id}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, {
            contentType, // ← FIXED: pakai content-type yang sudah di-resolve
            upsert: false,
        });

    if (error) {
        console.error("[upload DM] Supabase error:", error.message);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
        .from(BUCKET)
        .getPublicUrl(data.path);

    console.log("[upload] success, publicUrl:", urlData.publicUrl);

    return NextResponse.json({
        success: true,
        url: urlData.publicUrl,
        type: attachmentType,
        name: file.name,
        size: file.size,
    });
}

export const POST = withAuth(postHandler);