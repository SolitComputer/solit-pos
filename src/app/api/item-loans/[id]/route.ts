import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, ITEM_LOAN_APPROVE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }> }

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    if (!hasAnyRole(user.roles ?? [user.role], ITEM_LOAN_APPROVE_ROLES))
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

    const { id } = await props.params;
    const { action } = await req.json();

    const { data: loan } = await supabaseAdmin.from("item_loans").select("*").eq("id", id).single();
    if (!loan) return NextResponse.json({ success: false, message: "Data pinjaman tidak ditemukan" }, { status: 404 });

    let updates: Record<string, unknown>;
    if (action === "approve") {
      if (loan.status !== "PENDING")
        return NextResponse.json({ success: false, message: "Pengajuan sudah diproses" }, { status: 409 });
      updates = { status: "APPROVED", approved_by: user.id, approved_by_name: user.name, approved_at: new Date().toISOString() };
    } else if (action === "reject") {
      if (loan.status !== "PENDING")
        return NextResponse.json({ success: false, message: "Pengajuan sudah diproses" }, { status: 409 });
      updates = { status: "REJECTED", approved_by: user.id, approved_by_name: user.name, approved_at: new Date().toISOString() };
    } else if (action === "return") {
      if (loan.status !== "APPROVED")
        return NextResponse.json({ success: false, message: "Hanya pinjaman disetujui yang bisa dikembalikan" }, { status: 409 });
      updates = { status: "RETURNED", returned_at: new Date().toISOString() };
    } else {
      return NextResponse.json({ success: false, message: "Aksi tidak dikenal" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("item_loans").update(updates).eq("id", id).select().single();
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });

    try {
      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "item_loan", entityId: id,
        entityLabel: `${action.toUpperCase()} — ${loan.item_name}${loan.serial_number ? ` (${loan.serial_number})` : ""}`,
        beforeData: loan, afterData: data,
      });
    } catch { /* logging non-blocking */ }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const PATCH = withAuth(patchHandler);