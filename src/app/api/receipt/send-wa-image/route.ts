import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { isRateLimited } from "@/lib/rateLimit";

// ✅ SECURITY FIX: dulu route ini tidak lewat middleware (tidak ada di
// config.matcher) DAN tidak punya cek auth sendiri, jadi siapa pun (tanpa login)
// bisa memicu pengiriman WhatsApp pakai kredit Fonnte milik toko — jalur spam.
// Dibungkus withAuth: hanya user login yang bisa mengirim struk. Pemanggilnya
// memang halaman /dashboard (staff), jadi tidak ada fitur yang rusak.
// ✅ FIX lanjutan: withAuth tadinya tanpa daftar role (siapa pun yang login,
// termasuk role tak terkait transaksi, bisa kirim WA pakai kredit toko tanpa
// batas). Dibatasi ke role yang memang menangani transaksi/pembayaran, dan
// ditambah rate limit per user.
export const POST = withAuth(async (req: NextRequest, _ctx: unknown, user: AuthUser) => {
    try {
        if (isRateLimited(`send-wa-image:${user.id}`, 30, 60_000)) {
            return NextResponse.json({ success: false, message: "Terlalu banyak percobaan, coba lagi sebentar lagi" }, { status: 429 });
        }

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
}, PERMISSIONS.VIEW_TRANSACTIONS);