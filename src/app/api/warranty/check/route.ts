import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";

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
            .single();

        if (error || !data) {
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