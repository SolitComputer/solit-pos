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
} from "@/lib/permissions";
import { nextFollowupISO, normalizeSellerType, SellerType } from "@/lib/sellerFollowup";
import { logActivity } from "@/lib/activityLogger";
import { updateSellerPhoneSchema } from "@/lib/validation";

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
  if (!file.type.startsWith("image/")) throw new Error("Bukti FU harus berupa gambar");
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

    // ✅ Cek apakah PIC yang tercatat di customer ini masih aktif (whitelisted).
    // Kalau PIC lama sudah dinonaktifkan Admin, customer ini dianggap terbuka lagi
    // — sama seperti belum ada PIC — supaya tidak mengunci selamanya ke orang nonaktif.
    let picStillActive = false;
    if (existing.pic_user_id) {
      const { data: picActiveRow } = await supabaseAdmin
        .from("seller_followup_pics")
        .select("is_active")
        .eq("user_id", existing.pic_user_id)
        .maybeSingle();
      picStillActive = !!picActiveRow?.is_active;
    }

    // ── Ownership ─────────────────────────────────────────────────────────────
    const isOwnedByMe = !!existing.pic_user_id && existing.pic_user_id === user.id;
    // belum ada PIC, ATAU PIC lama sudah dinonaktifkan Admin → siapa pun (berwenang) bisa klaim
    const isUnowned = !existing.pic_user_id || !picStillActive;

    // ── GATE 0: non-supervisor hanya boleh sentuh miliknya atau yang belum ada PIC ──
    if (!isSupervisor && !isOwnedByMe && !isUnowned) {
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
      // GATE 1 — role
      if (!hasAnyRole(roles, PERMS.FOLLOWUP_SELLER)) {
        return NextResponse.json(
          {
            success: false,
            message: "Hanya Crew Sales & Kepala Marketing yang bisa melakukan follow-up",
          },
          { status: 403 }
        );
      }

      // GATE 2 — whitelist Admin
      const { data: picRow } = await supabaseAdmin
        .from("seller_followup_pics")
        .select("is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!picRow?.is_active) {
        return NextResponse.json(
          { success: false, message: "Akses follow-up kamu belum diaktifkan oleh Admin" },
          { status: 403 }
        );
      }

      // GATE 3 — hanya pemilik atau unowned yang bisa FU
      if (!isOwnedByMe && !isUnowned) {
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
      // GATE — sama seperti "followup": hanya yang berwenang FU customer ini atau Admin
      if (!canManage && !hasAnyRole(roles, PERMS.FOLLOWUP_SELLER)) {
        return NextResponse.json(
          { success: false, message: "Kamu tidak berwenang mengubah nomor HP customer ini" },
          { status: 403 }
        );
      }
      if (!canManage && !isOwnedByMe && !isUnowned) {
        return NextResponse.json(
          {
            success: false,
            message: `Customer ini sudah ditugaskan ke ${existing.closed_by ?? "PIC lain"}`,
          },
          { status: 403 }
        );
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
    } else if (action === "archive" || action === "reactivate" || action === "assign") {
      if (!canManage) {
        return NextResponse.json(
          { success: false, message: "Hanya Admin yang bisa melakukan aksi ini" },
          { status: 403 }
        );
      }

      if (action === "archive") {
        update.is_active = false;
      } else if (action === "reactivate") {
        update.is_active = true;
        update.next_followup_at = nextFollowupISO(sellerType);
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

        const validRole = targetRoles.some((r) =>
          (SELLER_PIC_CANDIDATE_ROLES as string[]).includes(r)
        );

        const { data: targetPic } = await supabaseAdmin
          .from("seller_followup_pics")
          .select("is_active")
          .eq("user_id", targetId)
          .maybeSingle();

        if (!target || !validRole || !targetPic?.is_active) {
          return NextResponse.json(
            { success: false, message: "PIC tujuan tidak valid atau belum diaktifkan" },
            { status: 400 }
          );
        }

        update.pic_user_id = target.id;
        update.closed_by = target.name; // jaga kompatibilitas kolom lama
      }
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