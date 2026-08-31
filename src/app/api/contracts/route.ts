import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { computeValidUntil } from "@/lib/contractTemplates";
import { CAREER_LEVELS } from "@/lib/careerLevels";
import { getContractSignerId, isExcludedFromContracts } from "@/lib/contractSigners";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
function hasFullAccess(user: AuthUser): boolean {
    const roles = user.roles?.length ? user.roles : [user.role];
    return roles.some((r) => FULL_ACCESS_ROLES.includes(r));
}

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    if (!hasFullAccess(user)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    if (!userId) {
        return NextResponse.json({ success: false, message: "user_id wajib" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("user_contracts")
        .select("*, admin:admin_signed_by(name)")
        .eq("user_id", userId)
        .order("sent_at", { ascending: false });

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    if (!hasFullAccess(user)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await req.json();
    const { user_id, contract_type, title, content, career_level, valid_from, duration_months, valid_until: customValidUntil } = body;

    if (!user_id || !contract_type || !title || !content || !valid_from) {
        return NextResponse.json(
            { success: false, message: "user_id, contract_type, title, content, valid_from wajib diisi" },
            { status: 400 }
        );
    }
    if (isExcludedFromContracts(user_id)) {
        return NextResponse.json({ success: false, message: "User ini tidak menerima kontrak kerja" }, { status: 400 });
    }
    if (!["PENGANTARAN", "GAJI_FLAT", "GAJI_NON_FLAT", "CUSTOM"].includes(contract_type)) {
        return NextResponse.json({ success: false, message: "contract_type tidak valid" }, { status: 400 });
    }
    if (career_level && !(CAREER_LEVELS as readonly string[]).includes(career_level)) {
        return NextResponse.json({ success: false, message: "career_level tidak valid" }, { status: 400 });
    }
    if (customValidUntil && customValidUntil <= valid_from) {
        return NextResponse.json({ success: false, message: "Tanggal berakhir harus setelah tanggal mulai" }, { status: 400 });
    }

    const months = duration_months === null || duration_months === undefined ? null : Number(duration_months);
    const validUntil = customValidUntil ? customValidUntil : computeValidUntil(valid_from, months);

    const { data: newContract, error } = await supabase
        .from("user_contracts")
        .insert({
            user_id,
            contract_type,
            title,
            content,
            career_level: career_level ?? null,
            status: "PENDING",
            sent_by: user.id,
            signer_id: getContractSignerId(user_id),
            valid_from,
            duration_months: months,
            valid_until: validUntil,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const { error: userUpdateError } = await supabase
        .from("users")
        .update({
            contract_status: "PENDING",
            active_contract_id: newContract.id,
            contract_valid_until: validUntil,
            career_level: career_level ?? null,
        })
        .eq("id", user_id);

    if (userUpdateError) {
        return NextResponse.json({ success: false, message: userUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: newContract });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);