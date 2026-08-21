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
    // ✅ SECURITY FIX: dulu search ditaruh mentah di string filter .or() —
    // karakter koma/kurung bisa menyisipkan kondisi filter tambahan.
    const search = (url.searchParams.get("search") ?? "").trim().replace(/[,()]/g, " ");

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

    // ✅ Daftar PIC yang MASIH aktif — dipakai untuk (1) visibility query di bawah
    // dan (2) hitung ulang is_owner/can_followup per baris di bagian enrich.
    const { data: activePicsRows } = await supabaseAdmin
      .from("seller_followup_pics")
      .select("user_id")
      .eq("is_active", true);
    const activePicIds = new Set((activePicsRows ?? []).map((p: any) => p.user_id as string));

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
        // Bisa lihat: milik sendiri, belum ada PIC-nya, ATAU PIC-nya sudah
        // dinonaktifkan Admin (PIC lama tidak boleh mengunci customer selamanya)
        const otherActiveIds = Array.from(activePicIds).filter((id) => id !== user.id);
        if (otherActiveIds.length > 0) {
          query = query.or(
            `pic_user_id.is.null,pic_user_id.not.in.(${otherActiveIds.join(",")})`
          );
        }
        // kalau tidak ada PIC aktif lain, semua row sudah "terbuka" — tidak perlu filter
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

     // ✅ PIC lama yang sudah dinonaktifkan Admin dianggap tidak lagi "mengunci" —
      // customer-nya kembali terbuka untuk PIC aktif mana pun (sama seperti unowned).
      const picIsStillActive = !!row.pic_user_id && activePicIds.has(row.pic_user_id);
      const isTrueOwner = row.pic_user_id === user.id;

      // is_owner (dipakai untuk gating tombol): milik sendiri, belum ada PIC,
      // ATAU PIC yang tercatat sudah tidak aktif lagi
      const isOwner = row.pic_user_id === null || isTrueOwner || !picIsStillActive;

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
        is_true_owner: isTrueOwner, // NEW — dipakai frontend khusus untuk badge "Kamu"
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