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

        const formData = new FormData();
        formData.append("target", normalized);
        formData.append("message", caption);
        formData.append("url", imageUrl);
        formData.append("filename", `struk-${invoice}.jpg`);

        const FONNTE_TOKEN = process.env.WHATSAPP_API_KEY;
        if (!FONNTE_TOKEN) {
            console.error("[send-wa-image] WHATSAPP_API_KEY tidak ditemukan di env");
            return NextResponse.json({ success: false, message: "API key not configured" });
        }

        const res = await fetch("https://api.fonnte.com/send", {
            method: "POST",
            headers: {
                Authorization: FONNTE_TOKEN,
            },
            body: formData,
        });

        const result = await res.json().catch(() => ({}));
        console.log("[send-wa-image] Fonnte response:", result);

        if (!res.ok || result.status === false) {
            return NextResponse.json({
                success: false,
                message: result.reason || result.message || "Fonnte error",
                detail: result,
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[send-wa-image] Error:", err);
        return NextResponse.json({ success: false, message: String(err) });
    }
}