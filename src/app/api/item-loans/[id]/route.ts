import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, ITEM_LOAN_APPROVE_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";

interface Props { params: Promise<{ id: string }> }

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { action } = await req.json();

    const { data: loan } = await supabaseAdmin.from("item_loans").select("*").eq("id", id).single();
    if (!loan) return NextResponse.json({ success: false, message: "Data pinjaman tidak ditemukan" }, { status: 404 });

    // approve/reject/approve-return/reject-return = khusus role ACC.
    // request-return = peminjam (pemilik) ATAU role ACC (boleh ajukan atas nama).
    const userRoles = user.roles ?? [user.role];
    const isApprover = hasAnyRole(userRoles, ITEM_LOAN_APPROVE_ROLES);
    const isBorrower = loan.borrower_id === user.id;

    let updates: Record<string, unknown>;
    if (action === "approve") {
      if (!isApprover) return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (loan.status !== "PENDING")
        return NextResponse.json({ success: false, message: "Pengajuan sudah diproses" }, { status: 409 });
      updates = { status: "APPROVED", approved_by: user.id, approved_by_name: user.name, approved_at: new Date().toISOString() };
    } else if (action === "reject") {
      if (!isApprover) return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (loan.status !== "PENDING")
        return NextResponse.json({ success: false, message: "Pengajuan sudah diproses" }, { status: 409 });
      updates = { status: "REJECTED", approved_by: user.id, approved_by_name: user.name, approved_at: new Date().toISOString() };
    } else if (action === "request-return") {
      if (!isBorrower && !isApprover) return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (loan.status !== "APPROVED")
        return NextResponse.json({ success: false, message: "Hanya pinjaman aktif yang bisa diajukan pengembalian" }, { status: 409 });
      updates = { status: "RETURN_PENDING" };
    } else if (action === "approve-return") {
      if (!isApprover) return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (loan.status !== "RETURN_PENDING")
        return NextResponse.json({ success: false, message: "Tidak ada pengajuan pengembalian untuk disetujui" }, { status: 409 });
      updates = { status: "RETURNED", returned_at: new Date().toISOString() };
    } else if (action === "reject-return") {
      if (!isApprover) return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      if (loan.status !== "RETURN_PENDING")
        return NextResponse.json({ success: false, message: "Tidak ada pengajuan pengembalian untuk ditolak" }, { status: 409 });
      updates = { status: "APPROVED" };
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