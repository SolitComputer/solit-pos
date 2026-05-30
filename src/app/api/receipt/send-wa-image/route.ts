import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { phone, imageUrl, invoice } = await req.json();

        if (!phone || !imageUrl) {
            return NextResponse.json({ success: false, message: "Missing phone or imageUrl" });
        }

        let normalized = phone.replace(/\D/g, "");
        if (normalized.startsWith("0")) normalized = "62" + normalized.slice(1);
        else if (!normalized.startsWith("62")) normalized = "62" + normalized;

        const caption = `🧾 Struk pembayaran invoice *${invoice}*\nTerima kasih sudah berbelanja di *Solit 03* 🙏`;

        // ✅ Pakai FormData, bukan JSON — Fonnte wajib FormData untuk kirim media
        const formData = new FormData();
        formData.append("target", normalized);
        formData.append("message", caption);
        formData.append("url", imageUrl);          // URL gambar dari Supabase
        formData.append("filename", `struk-${invoice}.jpg`);

        const res = await fetch("https://api.fonnte.com/send", {
            method: "POST",
            headers: {
                Authorization: process.env.WHATSAPP_API_KEY || "",
                // ✅ Jangan set Content-Type manual — biar browser/Node set boundary otomatis
            },
            body: formData,
        });

        const result = await res.json().catch(() => ({}));
        console.log("[send-wa-image] Fonnte response:", result);

        if (!res.ok || result.status === false) {
            return NextResponse.json({ 
                success: false, 
                message: result.reason || "Fonnte error" 
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[send-wa-image] Error:", err);
        return NextResponse.json({ success: false, message: "Internal error" });
    }
}