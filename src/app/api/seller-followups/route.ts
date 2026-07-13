// src/app/api/seller-followups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { isDue } from "@/lib/sellerFollowup";
import {
  hasAnyRole,
  expandRolesWithParents,
  PERMISSIONS as PERMS,
} from "@/lib/permissions";

async function getHandler(req: NextRequest, _ctx: { params: any }, user: AuthUser) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "ALL";
    const scope = url.searchParams.get("scope") ?? "ACTIVE";
    const search = (url.searchParams.get("search") ?? "").trim();

    const roles = expandRolesWithParents(user.roles ?? [user.role]);
    const isSupervisor = hasAnyRole(roles, PERMS.VIEW_ALL_SELLER_FOLLOWUP);
    const isActorRole = hasAnyRole(roles, PERMS.FOLLOWUP_SELLER);

    // Whitelist check
    const { data: picRow } = await supabaseAdmin
      .from("seller_followup_pics")
      .select("is_active")
      .eq("user_id", user.id)
      .maybeSingle();
    const isWhitelisted = !!picRow?.is_active;

    let query = supabase
      .from("seller_followups")
      .select("*")
      .order("next_followup_at", { ascending: true });

    // ✅ Visibility rules:
    // - Supervisor (Admin/Kepala): lihat SEMUA
    // - PIC aktif: lihat miliknya sendiri + customer yang BELUM punya PIC (orphan)
    // - PIC tidak aktif/role lain: hanya miliknya sendiri
    if (!isSupervisor) {
      if (isActorRole && isWhitelisted) {
        // Bisa lihat: milik sendiri ATAU belum ada PIC-nya (bisa diambil)
        query = query.or(`pic_user_id.eq.${user.id},pic_user_id.is.null`);
      } else {
        // Hanya milik sendiri
        query = query.eq("pic_user_id", user.id);
      }
    }

    if (type === "USER" || type === "PEDAGANG") query = query.eq("seller_type", type);
    if (scope === "ACTIVE") query = query.eq("is_active", true);
    else if (scope === "ARCHIVED") query = query.eq("is_active", false);

    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,invoice_number.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const now = new Date();
    const enriched = (data ?? []).map((row: any) => {
      const due = isDue(row.next_followup_at, now);

      // is_owner: milik sendiri ATAU belum ada PIC (siapa pun bisa klaim)
      const isOwner =
        row.pic_user_id === null ||
        (!!row.pic_user_id && row.pic_user_id === user.id);

      // can_followup: harus role benar + whitelisted + owner/unowned
      let lockReason: string | null = null;
      if (!isActorRole) {
        lockReason = "Role kamu tidak berwenang melakukan follow-up";
      } else if (!isWhitelisted) {
        lockReason = "Akses follow-up kamu belum diaktifkan Admin";
      } else if (!isOwner) {
        lockReason = `Customer ini sudah milik ${row.closed_by ?? "PIC lain"}`;
      }

      const canFollowup = isActorRole && isWhitelisted && isOwner;

      return {
        ...row,
        is_due: due,
        is_owner: isOwner,
        can_followup: canFollowup,
        lock_reason: lockReason,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: { is_supervisor: isSupervisor, is_whitelisted: isWhitelisted },
    });
  } catch (err: any) {
    console.error("[GET /api/seller-followups]", err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);