// src/app/api/seller-followups/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { hasPermission, PERMISSIONS as PERMS, UserRole } from "@/lib/permissions";
import { nextFollowupISO, normalizeSellerType, SellerType } from "@/lib/sellerFollowup";
import { logActivity } from "@/lib/activityLogger";

interface Props {
  params: Promise<{ id: string }>;
}

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const action: string | undefined = body.action;

    // ── Double-lock: hanya Closing (CREW_SALES) & Admin yang boleh action "followup" ──
    // ── Double-lock: hanya Closing (CREW_SALES) & Admin yang boleh action "followup" ──
    if (action === "followup") {
      if (!hasPermission(user.role as UserRole, PERMS.FOLLOWUP_SELLER)) {
        return NextResponse.json(
          { success: false, message: "Hanya tim Closing & Admin yang bisa melakukan follow-up" },
          { status: 403 }
        );
      }
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("seller_followups")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json(
        { success: false, message: "Data follow-up tidak ditemukan" },
        { status: 404 }
      );
    }

    // ── Triple-lock: FU cuma boleh oleh PIC (closed_by) atau Kepala Sales/Admin ──
    if (action === "followup") {
      const isPIC =
        !!existing.closed_by &&
        existing.closed_by.trim().toLowerCase() === (user.name ?? "").trim().toLowerCase();
      const isManager = hasPermission(user.role as UserRole, PERMS.MANAGE_SELLER_FOLLOWUP);

      if (!isPIC && !isManager) {
        return NextResponse.json(
          {
            success: false,
            message: `Hanya ${existing.closed_by ?? "PIC"} atau Kepala Sales yang bisa follow-up customer ini`,
          },
          { status: 403 }
        );
      }
    }

    const nowISO = new Date().toISOString();
    const update: Record<string, any> = { updated_at: nowISO };

    const sellerType: SellerType = body.seller_type
      ? normalizeSellerType(body.seller_type)
      : normalizeSellerType(existing.seller_type);
    if (body.seller_type) update.seller_type = sellerType;
    if (typeof body.notes === "string") update.notes = body.notes;

    if (action === "followup") {
      update.last_followup_at = nowISO;
      update.next_followup_at = nextFollowupISO(sellerType);
      update.followup_count = (existing.followup_count ?? 0) + 1;
      update.last_followup_by = user.name;
      update.is_active = true;
    } else if (action === "archive") {
      update.is_active = false;
    } else if (action === "reactivate") {
      update.is_active = true;
      update.next_followup_at = nextFollowupISO(sellerType);
    }

    const { data, error } = await supabase
      .from("seller_followups")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // ── Log aktivitas — non-blocking (kalau gagal, aksi tetap sukses) ──
    if (action) {
      const labelMap: Record<string, string> = {
        followup: "Follow-up",
        archive: "Arsip",
        reactivate: "Aktifkan",
      };
      try {
        await logActivity({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: "EDIT",
          entity: "seller_followup",
          entityId: id,
          entityLabel: `${labelMap[action] ?? action} — ${existing.customer_name} (${sellerType})`,
          beforeData: existing,
          afterData: data,
        });
      } catch (logErr: any) {
        console.error("[activity log seller_followup]", logErr?.message ?? logErr);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[PATCH /api/seller-followups/[id]]", err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

async function deleteHandler(req: NextRequest, props: Props, _user: AuthUser) {
  try {
    const { id } = await props.params;
    const { error } = await supabase.from("seller_followups").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/seller-followups/[id]]", err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

export const PATCH = withAuth(patchHandler, PERMISSIONS.MANAGE_SELLER_FOLLOWUP);
export const DELETE = withAuth(deleteHandler, PERMISSIONS.MANAGE_SELLER_FOLLOWUP);