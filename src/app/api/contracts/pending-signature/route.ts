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

async function getHandler(_req: NextRequest, _ctx: any, user: AuthUser) {
    if (!hasFullAccess(user)) {
        return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const { data, error } = await supabase
        .from("user_contracts")
        .select("id, title, contract_type, career_level, valid_from, valid_until, content, user_signature_url, responded_at, users:user_id(name)")
        .eq("signer_id", user.id)
        .eq("status", "PENDING_ADMIN_SIGNATURE")
        .order("responded_at", { ascending: true });

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data ?? [] });
}

export const GET = withAuth(getHandler);