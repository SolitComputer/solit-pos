import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const body = await req.json();
    const { decision, note, signature_data } = body;

    if (!["APPROVE", "REJECT"].includes(decision)) {
        return NextResponse.json({ success: false, message: "decision harus APPROVE atau REJECT" }, { status: 400 });
    }
    if (decision === "APPROVE" && (!signature_data || typeof signature_data !== "string" || !signature_data.startsWith("data:image/"))) {
        return NextResponse.json({ success: false, message: "Tanda tangan digital wajib diisi sebelum menyetujui kontrak" }, { status: 400 });
    }

    const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("active_contract_id")
        .eq("id", user.id)
        .maybeSingle();

    if (userError || !userRow?.active_contract_id) {
        return NextResponse.json({ success: false, message: "Tidak ada kontrak aktif untuk direspon" }, { status: 400 });
    }

    const { data: contract, error: contractError } = await supabase
        .from("user_contracts")
        .select("id, status")
        .eq("id", userRow.active_contract_id)
        .maybeSingle();

    if (contractError || !contract) {
        return NextResponse.json({ success: false, message: "Kontrak tidak ditemukan" }, { status: 404 });
    }
    if (contract.status !== "PENDING") {
        return NextResponse.json({ success: false, message: "Kontrak ini sudah direspon sebelumnya" }, { status: 400 });
    }

    const newStatus = decision === "APPROVE" ? "PENDING_ADMIN_SIGNATURE" : "REJECTED";

    const { error: updateContractError } = await supabase
        .from("user_contracts")
        .update({
            status: newStatus,
            responded_at: new Date().toISOString(),
            response_note: note || null,
            user_signature_url: decision === "APPROVE" ? signature_data : null,
            user_signed_at: decision === "APPROVE" ? new Date().toISOString() : null,
        })
        .eq("id", contract.id);

    if (updateContractError) {
        return NextResponse.json({ success: false, message: updateContractError.message }, { status: 500 });
    }

    const { error: updateUserError } = await supabase
        .from("users")
        .update({ contract_status: newStatus })
        .eq("id", user.id);

    if (updateUserError) {
        return NextResponse.json({ success: false, message: updateUserError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: newStatus });
}

export const POST = withAuth(postHandler);