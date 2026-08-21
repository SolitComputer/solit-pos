import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { isRateLimited } from "@/lib/rateLimit";

const ALLOWED_ORIGINS = [
    "https://solit03.com",
    "https://www.solit03.com",
    "http://localhost:5173",
    "http://localhost:3000",
];

function getCorsHeaders(origin: string): Record<string, string> {
    const isAllowed = ALLOWED_ORIGINS.includes(origin);
    return {
        "Access-Control-Allow-Origin": isAllowed ? origin : "https://solit03.com",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
    };
}

// ── OPTIONS — preflight handler ───────────────────────────────────────────────
export async function OPTIONS(req: NextRequest) {
    const origin = req.headers.get("origin") || "";
    return new NextResponse(null, {
        status: 204,
        headers: getCorsHeaders(origin),
    });
}

// ── GET — cek garansi publik ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const origin = req.headers.get("origin") || "";
    const corsHeaders = getCorsHeaders(origin);

    try {
        // ✅ SECURITY FIX: endpoint publik ini (tanpa login, tanpa batas) bisa
        // dipakai untuk mengumpulkan nama pelanggan lewat percobaan serial
        // number berulang. Dibatasi 20 request/menit per IP — cukup untuk
        // pemakaian wajar (cek 1 SN), tapi menghambat scraping/enumerasi.
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        if (isRateLimited(`warranty-check:${ip}`, 20, 60_000)) {
            return NextResponse.json(
                { success: false, message: "Terlalu banyak percobaan, coba lagi sebentar lagi" },
                { status: 429, headers: corsHeaders }
            );
        }

        const { searchParams } = new URL(req.url);
        const sn = searchParams.get("sn")?.trim();

        if (!sn) {
            return NextResponse.json(
                { success: false, message: "Parameter 'sn' wajib diisi" },
                { status: 400, headers: corsHeaders }
            );
        }

        const { data, error } = await supabase
            .from("warranties")
            .select(
                "id, serial_number, customer_name, laptop_name, warranty_start, warranty_end, status, notes"
            )
            .eq("serial_number", sn.toUpperCase())
            .neq("status", "VOID")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("[WARRANTY CHECK] Supabase error:", error.message);
            return NextResponse.json(
                { success: false, message: "Gagal mengambil data garansi" },
                { status: 500, headers: corsHeaders }
            );
        }

        if (!data) {
            return NextResponse.json(
                { success: false, message: `Garansi untuk SN "${sn}" tidak ditemukan` },
                { status: 404, headers: corsHeaders }
            );
        }

        // Hitung status realtime
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(data.warranty_end);
        end.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil(
            (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        const computedStatus =
            daysLeft < 0 ? "EXPIRED" : daysLeft <= 7 ? "EXPIRING_SOON" : "ACTIVE";

        return NextResponse.json(
            {
                success: true,
                data: {
                    serial_number: data.serial_number,
                    customer_name: data.customer_name,
                    laptop_name: data.laptop_name,
                    warranty_start: data.warranty_start,
                    warranty_end: data.warranty_end,
                    status: computedStatus,
                    days_left: daysLeft,
                    notes: data.notes || null,
                },
            },
            { headers: corsHeaders }
        );
    } catch (err) {
        console.error("[WARRANTY CHECK]", err);
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500, headers: corsHeaders }
        );
    }
}