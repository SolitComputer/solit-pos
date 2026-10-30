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
  canActorFollowupType, // ✅ cek role boleh FU kategori tertentu (per baris)
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

    // ✅ Whitelist check PER KATEGORI untuk user yang login.
    // Satu orang bisa aktif di USER saja, PEDAGANG saja, atau keduanya.
    const { data: myPicRows } = await supabaseAdmin
      .from("seller_followup_pics")
      .select("seller_type, is_active")
      .eq("user_id", user.id);

    const whitelistedByType: Record<"USER" | "PEDAGANG", boolean> = {
      USER: (myPicRows ?? []).some((p: any) => p.seller_type === "USER" && p.is_active),
      PEDAGANG: (myPicRows ?? []).some((p: any) => p.seller_type === "PEDAGANG" && p.is_active),
    };
    // Aktif di salah satu kategori — dipakai untuk visibility kasar (boleh lihat
    // customer orphan atau tidak sama sekali).
    const isWhitelistedAny = whitelistedByType.USER || whitelistedByType.PEDAGANG;

    // ✅ Daftar PIC aktif, DIPISAH per kategori. Dipakai untuk menentukan apakah
    // seorang PIC masih "mengunci" customer bertipe tertentu.
    const { data: activePicsRows } = await supabaseAdmin
      .from("seller_followup_pics")
      .select("user_id, seller_type")
      .eq("is_active", true);

    const activePicIdsByType: Record<"USER" | "PEDAGANG", Set<string>> = {
      USER: new Set(
        (activePicsRows ?? [])
          .filter((p: any) => p.seller_type === "USER")
          .map((p: any) => p.user_id as string)
      ),
      PEDAGANG: new Set(
        (activePicsRows ?? [])
          .filter((p: any) => p.seller_type === "PEDAGANG")
          .map((p: any) => p.user_id as string)
      ),
    };

    let query = supabase
      .from("seller_followups")
      .select("*")
      .order("next_followup_at", { ascending: true });

    // ✅ Visibility rules:
    // - Supervisor (Admin/Kepala): lihat SEMUA
    // - PIC aktif: lihat miliknya sendiri + customer yang BELUM punya PIC (orphan)
    // - PIC tidak aktif/role lain: hanya miliknya sendiri
    if (!isSupervisor) {
      if (isActorRole && isWhitelistedAny) {
        // ✅ OWNERSHIP KETAT (keputusan 2026-10-30):
        // Sales yang tercentang boleh lihat:
        //   - customer MILIK SENDIRI, ATAU
        //   - customer yang BELUM punya PIC (pic_user_id null), ATAU
        //   - customer yang PIC-nya sudah dinonaktifkan Admin (tidak ada di
        //     daftar PIC aktif kategori mana pun → dianggap terbuka lagi).
        // Customer milik PIC lain yang MASIH aktif = TIDAK terlihat (privat).
        //
        // Gabungan PIC aktif dari kedua kategori — seorang PIC "mengunci"
        // customer selama dia masih aktif di MINIMAL satu kategori.
        const anyActiveIds = new Set<string>([
          ...activePicIdsByType.USER,
          ...activePicIdsByType.PEDAGANG,
        ]);
        const lockingOtherIds = Array.from(anyActiveIds).filter((id) => id !== user.id);

        if (lockingOtherIds.length > 0) {
          // Terlihat kalau: punya sendiri ATAU belum ada PIC ATAU PIC-nya sudah
          // tidak aktif (tidak termasuk daftar lockingOtherIds).
          query = query.or(
            `pic_user_id.eq.${user.id},pic_user_id.is.null,pic_user_id.not.in.(${lockingOtherIds.join(",")})`
          );
        }
        // kalau tidak ada PIC aktif lain yang mengunci, semua row terbuka —
        // tidak perlu filter tambahan.
      } else {
        // Role bukan actor / tidak tercentang di kategori mana pun → hanya
        // bisa lihat customer miliknya sendiri.
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
    const enriched = (data ?? [])
      .map((row: any) => {
        const due = isDue(row.next_followup_at, now);

         // ✅ Tipe customer baris ini menentukan whitelist & "penguncian" mana
        // yang dipakai. Normalisasi defensif ke USER kalau nilainya aneh.
        const rowType: "USER" | "PEDAGANG" =
          row.seller_type === "PEDAGANG" ? "PEDAGANG" : "USER";
        const activeSetForType = activePicIdsByType[rowType];
        const iAmWhitelistedForType = whitelistedByType[rowType];

        // ✅ Role-ku boleh FU kategori baris INI? (keputusan 2026-10-30 rev)
        //   - Crew Sales     → hanya baris USER
        //   - Kepala Marketing → hanya baris PEDAGANG
        // Dihitung per baris, bukan global, karena actor beda per kategori.
        const iAmActorForType = canActorFollowupType(roles, rowType);

        // ✅ PIC yang tercatat masih "mengunci" customer ini HANYA kalau dia
        // masih aktif DI KATEGORI customer ini. Kalau PIC-nya aktif di USER
        // tapi customer ini PEDAGANG & dia nonaktif di PEDAGANG → tidak mengunci.
        const picIsStillActive = !!row.pic_user_id && activeSetForType.has(row.pic_user_id);
        const isTrueOwner = row.pic_user_id === user.id;

        // is_owner (gating tombol) — OWNERSHIP KETAT:
        //   - belum ada PIC (null), ATAU
        //   - aku memang pemiliknya, ATAU
        //   - PIC yang tercatat sudah tidak aktif di kategori ini (terbuka lagi).
        // Customer milik PIC lain yang MASIH aktif di kategori ini → BUKAN owner.
        const isOwner = row.pic_user_id === null || isTrueOwner || !picIsStillActive;

        let lockReason: string | null = null;
        if (!iAmActorForType) {
          lockReason = `Follow-up ${rowType === "PEDAGANG" ? "Pedagang" : "User"} bukan wewenang role kamu`;
        } else if (!iAmWhitelistedForType) {
          lockReason = `Akses follow-up ${rowType === "PEDAGANG" ? "Pedagang" : "User"} kamu belum diaktifkan Admin`;
        } else if (!isOwner) {
          lockReason = `Customer ini sudah milik ${row.closed_by ?? "PIC lain"}`;
        }

        // ✅ can_followup: actor SESUAI kategori + whitelist sesuai kategori + owner.
        const canFollowup = iAmActorForType && iAmWhitelistedForType && isOwner;

        return {
          ...row,
          is_due: due,
          is_owner: isOwner,
          is_true_owner: isTrueOwner,
          can_followup: canFollowup,
          lock_reason: lockReason,
          // ✅ flag bantu buat frontend (opsional dipakai di Langkah 8)
          _row_type: rowType,
          _whitelisted_for_type: iAmWhitelistedForType,
        };
      })
      // ✅ FILTER HALUS (ownership ketat per kategori):
      // Supervisor lihat semua (jangan disaring). Untuk non-supervisor, buang
      // baris yang: BUKAN miliknya, sudah ADA PIC-nya, DAN PIC itu masih aktif
      // di kategori baris ini → itu privat milik orang lain, tidak boleh nongol.
      .filter((row: any) => {
        if (isSupervisor) return true;
        const isTrueOwner = row.pic_user_id === user.id;
        const hasOwner = !!row.pic_user_id;
        const ownerStillLocks =
          hasOwner && activePicIdsByType[row._row_type as "USER" | "PEDAGANG"].has(row.pic_user_id);
        // tampilkan kalau: punyaku ATAU belum ada PIC ATAU PIC-nya sudah lepas
        return isTrueOwner || !hasOwner || !ownerStillLocks;
      });

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: {
        is_supervisor: isSupervisor,
        // ✅ status whitelist dipecah per kategori — frontend bisa pakai untuk
        // info "kamu aktif di USER saja / PEDAGANG saja / dua-duanya".
        is_whitelisted_user: whitelistedByType.USER,
        is_whitelisted_pedagang: whitelistedByType.PEDAGANG,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/seller-followups]", err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);