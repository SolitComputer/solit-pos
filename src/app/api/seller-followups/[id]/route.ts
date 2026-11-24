// src/app/api/seller-followups/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import {
  hasAnyRole,
  expandRolesWithParents,
  PERMISSIONS as PERMS,
  SELLER_PIC_CANDIDATE_ROLES,
  canActorFollowupType, // ✅ cek role boleh FU kategori tertentu
} from "@/lib/permissions";
import { nextFollowupISO, normalizeSellerType, SellerType } from "@/lib/sellerFollowup";
import { logActivity } from "@/lib/activityLogger";
import { updateSellerPhoneSchema } from "@/lib/validation";
import { isSellerArchiveManager } from "@/lib/sellerArchiveAccess";

export const runtime = "nodejs"; // butuh Buffer untuk upload storage

interface Props {
  params: Promise<{ id: string }>;
}

const PROOF_BUCKET = "followup-proofs";
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * Frontend mengirim FormData saat action "followup" (karena ada file bukti),
 * dan JSON untuk action lain. Handler lama selalu req.json() → crash di multipart.
 */
async function parseBody(
  req: NextRequest
): Promise<{ fields: Record<string, any>; buktiFu: File | null }> {
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const fields: Record<string, any> = {};
    let buktiFu: File | null = null;

    for (const [key, value] of fd.entries()) {
      if (value instanceof File) {
        if (key === "bukti_fu") buktiFu = value;
      } else {
        fields[key] = String(value);
      }
    }
    return { fields, buktiFu };
  }

  const json = await req.json().catch(() => ({}));
  return { fields: json ?? {}, buktiFu: null };
}

async function uploadProof(file: File, followupId: string): Promise<string> {
  // ✅ FIX: "image/*" mencakup image/svg+xml — SVG bisa berisi <script> yang
  // jalan kalau dibuka langsung dari bucket publik. Dipersempit ke raster.
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Bukti FU harus berupa gambar JPG/PNG/WEBP");
  if (file.size > MAX_PROOF_BYTES) throw new Error("Ukuran bukti FU maksimal 5 MB");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${followupId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabaseAdmin.storage
    .from(PROOF_BUCKET)
    .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) throw new Error(`Gagal upload bukti FU: ${error.message}`);

  const { data } = supabaseAdmin.storage.from(PROOF_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function patchHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;
    const { fields, buktiFu } = await parseBody(req);
    const action: string | undefined = fields.action;

    const roles = expandRolesWithParents(user.roles ?? [user.role]);
    const isSupervisor = hasAnyRole(roles, PERMS.VIEW_ALL_SELLER_FOLLOWUP);
    const canManage = hasAnyRole(roles, PERMS.MANAGE_SELLER_FOLLOWUP);

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

    // ✅ Tipe customer ini — menentukan kategori whitelist mana yang berlaku.
    const existingType: SellerType = normalizeSellerType(existing.seller_type);

    // ✅ Cek apakah PIC yang tercatat masih aktif DI KATEGORI customer ini.
    // Kalau PIC lama sudah dinonaktifkan Admin untuk kategori ini, customer
    // dianggap terbuka lagi — tidak mengunci selamanya ke orang nonaktif.
    // (PIC yang aktif di USER tapi nonaktif di PEDAGANG tidak mengunci customer
    // PEDAGANG, dan sebaliknya.)
       // ✅ Cek PIC lama masih aktif di kategori ini, SEKALIGUS cek apakah user
    // yang request ini juga aktif di kategori yang sama (dipakai utk fitur
    // "teman satu kategori boleh bantu FU" — isTeammateForType di bawah).
    // Digabung jadi 1 query biar tidak 2x round-trip ke DB.
    const picCheckIds = Array.from(
      new Set([existing.pic_user_id, user.id].filter(Boolean) as string[])
    );
    const { data: picActiveRows } = await supabaseAdmin
      .from("seller_followup_pics")
      .select("user_id, is_active")
      .eq("seller_type", existingType)
      .in("user_id", picCheckIds);

    const picStillActive =
      !!existing.pic_user_id &&
      !!picActiveRows?.find((r: any) => r.user_id === existing.pic_user_id)?.is_active;
    const iAmActiveForType = !!picActiveRows?.find((r: any) => r.user_id === user.id)?.is_active;

    // ── Ownership ─────────────────────────────────────────────────────────────
    const isOwnedByMe = !!existing.pic_user_id && existing.pic_user_id === user.id;
    // belum ada PIC, ATAU PIC lama sudah dinonaktifkan Admin → siapa pun (berwenang) bisa klaim
    const isUnowned = !existing.pic_user_id || !picStillActive;

    // ── Teman satu kategori boleh bantu FU (keputusan 2026-11-19) ──────────────
    // Sesama actor kategori ini (CREW_SALES utk USER, KEPALA_MARKETING utk
    // PEDAGANG) yang aktif di whitelist kategori ini boleh bantu follow-up
    // customer siapapun di kategori itu, walau PIC-nya bukan dia — supaya tim
    // bisa saling cover. pic_user_id TIDAK berubah (lihat auto-claim di bawah,
    // itu cuma jalan kalau isUnowned, jadi PIC asli tetap tercatat).
    const isTeammateForType =
      canActorFollowupType(roles, existingType as "USER" | "PEDAGANG") && iAmActiveForType;

    // ── GATE 0: non-supervisor hanya boleh sentuh miliknya, yang belum ada PIC,
    // atau milik teman satu kategori (isTeammateForType) ───────────────────────
    if (!isSupervisor && !isOwnedByMe && !isUnowned && !isTeammateForType) {
      return NextResponse.json(
        { success: false, message: "Customer ini sudah milik PIC lain" },
        { status: 403 }
      );
    }

    const nowISO = new Date().toISOString();
    const update: Record<string, any> = { updated_at: nowISO };

    const sellerType: SellerType = fields.seller_type
      ? normalizeSellerType(fields.seller_type)
      : normalizeSellerType(existing.seller_type);
    if (fields.seller_type) update.seller_type = sellerType;
    if (typeof fields.notes === "string") update.notes = fields.notes;

    if (action === "followup") {
      // GATE 1 — role PER KATEGORI (keputusan 2026-10-30 rev):
      //   - USER     → hanya Crew Sales
      //   - PEDAGANG → hanya Kepala Marketing
      // sellerType = tipe yang diproses di request ini (dihitung di atas).
      if (!canActorFollowupType(roles, sellerType as "USER" | "PEDAGANG")) {
        return NextResponse.json(
          {
            success: false,
            message: `Follow-up ${sellerType === "PEDAGANG" ? "Pedagang" : "User"} bukan wewenang role kamu`,
          },
          { status: 403 }
        );
      }

      // GATE 2 — whitelist Admin, PER KATEGORI customer ini.
      // Budi yang aktif di USER tapi tidak di PEDAGANG → ditolak saat FU
      // customer PEDAGANG. Pakai sellerType (tipe yang diproses di request ini).
      const { data: picRow } = await supabaseAdmin
        .from("seller_followup_pics")
        .select("is_active")
        .eq("user_id", user.id)
        .eq("seller_type", sellerType)
        .maybeSingle();

      if (!picRow?.is_active) {
        return NextResponse.json(
          {
            success: false,
            message: `Akses follow-up ${sellerType === "PEDAGANG" ? "Pedagang" : "User"} kamu belum diaktifkan oleh Admin`,
          },
          { status: 403 }
        );
      }

      // GATE 3 — pemilik, unowned, ATAU teman satu kategori (co-FU) yang bisa FU
      if (!isOwnedByMe && !isUnowned && !isTeammateForType) {
        return NextResponse.json(
          {
            success: false,
            message: `Customer ini sudah ditugaskan ke ${existing.closed_by ?? "PIC lain"}`,
          },
          { status: 403 }
        );
      }

      if (!buktiFu) {
        return NextResponse.json(
          { success: false, message: "Bukti follow-up (screenshot) wajib diupload" },
          { status: 400 }
        );
      }

      update.last_followup_proof_url = await uploadProof(buktiFu, id);
      update.last_followup_at = nowISO;
      update.next_followup_at = nextFollowupISO(sellerType);
      update.followup_count = (existing.followup_count ?? 0) + 1;
      update.last_followup_by = user.name;
      update.is_active = true;

      // ✅ AUTO-CLAIM: jika belum ada PIC, yang FU pertama jadi owner-nya
      if (isUnowned) {
        update.pic_user_id = user.id;
        update.closed_by = user.name;
      }
    } else if (action === "update_phone") {
      // GATE — hanya Admin, ATAU actor yang berwenang atas KATEGORI customer ini
      // (Crew Sales utk USER, Kepala Marketing utk PEDAGANG).
      if (!canManage && !canActorFollowupType(roles, existingType)) {
        return NextResponse.json(
          { success: false, message: "Kamu tidak berwenang mengubah nomor HP customer ini" },
          { status: 403 }
        );
      }
      // ✅ Kalau bukan Admin: wajib whitelisted DI KATEGORI customer ini,
      // sekaligus pemilik/unowned. Mencegah sales yang aktif di kategori lain
      // mengubah nomor HP customer yang bukan wewenangnya.
      if (!canManage) {
        const { data: myPicRow } = await supabaseAdmin
          .from("seller_followup_pics")
          .select("is_active")
          .eq("user_id", user.id)
          .eq("seller_type", existingType)
          .maybeSingle();

        if (!myPicRow?.is_active) {
          return NextResponse.json(
            {
              success: false,
              message: `Akses ${existingType === "PEDAGANG" ? "Pedagang" : "User"} kamu belum diaktifkan Admin`,
            },
            { status: 403 }
          );
        }
        if (!isOwnedByMe && !isUnowned) {
          return NextResponse.json(
            {
              success: false,
              message: `Customer ini sudah ditugaskan ke ${existing.closed_by ?? "PIC lain"}`,
            },
            { status: 403 }
          );
        }
      }

      const parsed = updateSellerPhoneSchema.safeParse({
        customer_phone: fields.customer_phone,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: parsed.error.issues[0]?.message ?? "Nomor HP tidak valid" },
          { status: 400 }
        );
      }

      update.customer_phone = parsed.data.customer_phone;
    } else if (
      action === "archive" ||
      action === "update_archive_reason" ||
      action === "reactivate" ||
      action === "assign"
    ) {
      // ✅ Keputusan bisnis (Task A): khusus action "archive" & "update_archive_reason",
      // selain Admin (canManage), 2 akun di SELLER_ARCHIVE_MANAGER_IDS juga boleh —
      // biar Fikri/Nur Alim bisa arsip tanpa perlu jadi Admin penuh.
      // "reactivate" & "assign" TETAP Admin-only.
      const isArchiveAction = action === "archive" || action === "update_archive_reason";
      const authorizedForAction = isArchiveAction
        ? canManage || isSellerArchiveManager(user.id)
        : canManage;

      if (!authorizedForAction) {
        return NextResponse.json(
          { success: false, message: "Hanya Admin yang bisa melakukan aksi ini" },
          { status: 403 }
        );
      }

      if (action === "archive") {
        // ✅ Alasan arsip wajib, divalidasi di server supaya tidak bisa
        // dilewati lewat request manual.
        const reason = String(fields.archive_reason ?? "").trim();
        if (reason.length < 5 || reason.length > 300) {
          return NextResponse.json(
            { success: false, message: "Alasan arsip wajib diisi (5–300 karakter)" },
            { status: 400 }
          );
        }
        update.is_active = false;
        update.archive_reason = reason;
        update.archived_at = nowISO;
        update.archived_by = user.name;
      } else if (action === "update_archive_reason") {
        if (existing.is_active) {
          return NextResponse.json(
            { success: false, message: "Customer ini tidak sedang diarsipkan" },
            { status: 400 }
          );
        }
        const reason = String(fields.archive_reason ?? "").trim();
        if (reason.length < 5 || reason.length > 300) {
          return NextResponse.json(
            { success: false, message: "Alasan arsip wajib diisi (5–300 karakter)" },
            { status: 400 }
          );
        }
        update.archive_reason = reason;
        // data lama (diarsipkan sebelum fitur ini) belum punya pencatat → isi sekarang
        if (!existing.archived_by) {
          update.archived_by = user.name;
          update.archived_at = nowISO;
        }
      } else if (action === "reactivate") {
        update.is_active = true;
        update.next_followup_at = nextFollowupISO(sellerType);
        // ✅ Bersihkan jejak arsip lama
        update.archive_reason = null;
        update.archived_at = null;
        update.archived_by = null;
      } else if (action === "assign") {
        const targetId: string | undefined = fields.pic_user_id;
        if (!targetId) {
          return NextResponse.json(
            { success: false, message: "PIC tujuan wajib dipilih" },
            { status: 400 }
          );
        }

        const { data: target } = await supabaseAdmin
          .from("users")
          .select("id, name, role, roles")
          .eq("id", targetId)
          .maybeSingle();

        const targetRoles: string[] =
          Array.isArray(target?.roles) && target!.roles.length > 0
            ? target!.roles
            : [target?.role].filter(Boolean) as string[];

        // ✅ Role target harus cocok KATEGORI customer ini, bukan sekadar
        // "termasuk kandidat PIC". Admin tidak bisa assign customer PEDAGANG
        // ke Crew Sales (atau customer USER ke Kepala Marketing).
        const validRole = canActorFollowupType(targetRoles, existingType);
        
        // ✅ Target harus aktif DI KATEGORI customer ini. Assign customer
        // PEDAGANG ke sales yang hanya aktif di USER → ditolak.
        const { data: targetPic } = await supabaseAdmin
          .from("seller_followup_pics")
          .select("is_active")
          .eq("user_id", targetId)
          .eq("seller_type", existingType)
          .maybeSingle();

        if (!target || !validRole || !targetPic?.is_active) {
          return NextResponse.json(
            {
              success: false,
              message: `PIC tujuan tidak valid atau belum diaktifkan untuk kategori ${existingType === "PEDAGANG" ? "Pedagang" : "User"}`,
            },
            { status: 400 }
          );
        }

        update.pic_user_id = target.id;
        update.closed_by = target.name; // jaga kompatibilitas kolom lama
      }
    }

    const KNOWN_ACTIONS = [
      "followup",
      "update_phone",
      "archive",
      "update_archive_reason",
      "reactivate",
      "assign",
    ];
    if (action && !KNOWN_ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, message: `Aksi "${action}" tidak dikenali server` },
        { status: 400 }
      );
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

    if (action) {
      const labelMap: Record<string, string> = {
        followup: "Follow-up",
        archive: "Arsip",
        update_archive_reason: "Edit Alasan Arsip",
        reactivate: "Aktifkan",
        assign: "Assign PIC",
        update_phone: "Edit Nomor HP",
      };
      try {
        await logActivity({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: "EDIT",
          entity: "seller_followup",
          entityId: id,
          entityLabel: `${labelMap[action] ?? action} — ${existing.customer_name} (${sellerType})${
            (action === "archive" || action === "update_archive_reason") && update.archive_reason ? ` · Alasan: ${update.archive_reason}` : ""
          }`,
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
    return NextResponse.json(
      { success: false, message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

async function deleteHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    // GATE — hanya Admin & Kepala Marketing yang boleh hapus permanen
    const roles = expandRolesWithParents(user.roles ?? [user.role]);
    if (!hasAnyRole(roles, PERMS.DELETE_SELLER_FOLLOWUP)) {
      return NextResponse.json(
        { success: false, message: "Hanya Admin & Kepala Marketing yang bisa menghapus data" },
        { status: 403 }
      );
    }

    // Ambil data dulu buat activity log (before-data) sebelum dihapus
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

    const { error } = await supabase.from("seller_followups").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    try {
      await logActivity({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "EDIT", // TODO: ganti ke "DELETE" kalau enum activityLogger support
        entity: "seller_followup",
        entityId: id,
        entityLabel: `Hapus — ${existing.customer_name} (${existing.seller_type})`,
        beforeData: existing,
      });
    } catch (logErr: any) {
      console.error("[activity log seller_followup delete]", logErr?.message ?? logErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/seller-followups/[id]]", err);
    return NextResponse.json({ success: false, message: String(err) }, { status: 500 });
  }
}

// PATCH dibuka untuk semua role yang bisa VIEW; otorisasi detail dicek di dalam handler.
export const PATCH = withAuth(patchHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);
export const DELETE = withAuth(deleteHandler, PERMISSIONS.VIEW_SELLER_FOLLOWUP);