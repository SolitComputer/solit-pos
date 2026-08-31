import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
function hasFullAccess(user: AuthUser): boolean {
    const roles = user.roles?.length ? user.roles : [user.role];
    return roles.some((r) => FULL_ACCESS_ROLES.includes(r));
}

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    if (!hasFullAccess(user)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await req.json();
    const { contract_id, decision, signature_data, note } = body;

    if (!contract_id || !["SIGN", "REJECT"].includes(decision)) {
        return NextResponse.json({ success: false, message: "contract_id dan decision (SIGN/REJECT) wajib diisi" }, { status: 400 });
    }
    if (decision === "SIGN" && !signature_data) {
        return NextResponse.json({ success: false, message: "Tanda tangan wajib diisi" }, { status: 400 });
    }

    const { data: contract, error: contractError } = await supabase
        .from("user_contracts")
        .select("id, user_id, status, signer_id")
        .eq("id", contract_id)
        .maybeSingle();

    if (contractError || !contract) {
        return NextResponse.json({ success: false, message: "Kontrak tidak ditemukan" }, { status: 404 });
    }
    if (contract.status !== "PENDING_ADMIN_SIGNATURE") {
        return NextResponse.json({ success: false, message: "Kontrak ini belum ditandatangani karyawan atau sudah diproses" }, { status: 400 });
    }
    // Hanya admin penanggung jawab (signer_id) yang boleh countersign kontrak ini —
    // ini yang menjamin aturan "Yoga tanda tangan semua orang, Reinaldy tanda tangan Yoga".
    if (contract.signer_id !== user.id) {
        return NextResponse.json({ success: false, message: "Kamu bukan penandatangan yang ditunjuk untuk kontrak ini" }, { status: 403 });
    }

    const newStatus = decision === "SIGN" ? "APPROVED" : "REJECTED";

    const { error: updateContractError } = await supabase
        .from("user_contracts")
        .update({
            status: newStatus,
            admin_signature_url: decision === "SIGN" ? signature_data : null,
            admin_signed_by: decision === "SIGN" ? user.id : null,
            admin_signed_at: decision === "SIGN" ? new Date().toISOString() : null,
            response_note: note || null,
        })
        .eq("id", contract.id);

    if (updateContractError) {
        return NextResponse.json({ success: false, message: updateContractError.message }, { status: 500 });
    }

    const { error: updateUserError } = await supabase
        .from("users")
        .update({ contract_status: newStatus })
        .eq("id", contract.user_id);

    if (updateUserError) {
        return NextResponse.json({ success: false, message: updateUserError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: newStatus });
}

export const POST = withAuth(postHandler);