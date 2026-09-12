import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    FUND_REQUEST_VIEW_ROLES,
    FUND_REQUEST_CREATE_ROLES,
    type UserRole,
} from "@/lib/permissions";

// Import variabel dari file baru
import { FUND_EXECUTOR_IDS, FUND_APPROVER_IDS } from "@/lib/fundConfig";

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

// ── GET: ambil semua fund requests ────────────────────────────────────────────
export async function GET(request: NextRequest) {
    const userId = request.headers.get("x-user-id");
    const roles = (request.headers.get("x-user-roles") || "").split(",").filter(Boolean);

    if (!userId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const hasAccess = roles.some((r) => (FUND_REQUEST_VIEW_ROLES as string[]).includes(r));
    if (!hasAccess) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const supabase = db();
    const { data, error } = await supabase
        .from("fund_requests")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        data,
        meta: {
            approverIds: FUND_APPROVER_IDS,
            executorIds: FUND_EXECUTOR_IDS,
        },
    });
}

// ── POST: buat pengajuan dana baru (hanya Kepala Divisi) ──────────────────────
export async function POST(request: NextRequest) {
    const userId = request.headers.get("x-user-id");
    const userName = decodeURIComponent(request.headers.get("x-user-name") || "");
    const roles = (request.headers.get("x-user-roles") || "").split(",").filter(Boolean);

    if (!userId) {
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const canCreate = roles.some((r) => (FUND_REQUEST_CREATE_ROLES as string[]).includes(r));
    if (!canCreate) {
        return NextResponse.json(
            { success: false, message: "Hanya Kepala Divisi yang boleh mengajukan dana" },
            { status: 403 }
        );
    }

    let body: { purpose?: string; amount?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
    }

    const { purpose, amount } = body;
    if (!purpose || typeof purpose !== "string" || !purpose.trim()) {
        return NextResponse.json({ success: false, message: "Kebutuhan wajib diisi" }, { status: 400 });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
        return NextResponse.json({ success: false, message: "Nominal harus lebih dari 0" }, { status: 400 });
    }

    const supabase = db();
    const { data, error } = await supabase
        .from("fund_requests")
        .insert({
            requester_id: userId,
            requester_name: userName,
            purpose: purpose.trim(),
            amount: Math.round(amount),
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
}