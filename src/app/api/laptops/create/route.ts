import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { expandRolesWithParents, canEditConditionChecks } from "@/lib/permissions";
import { computeDedupHash } from "@/lib/dedupHash";
import { sanitizeConditionChecks } from "@/lib/conditionChecks";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";
import { logActivity } from "@/lib/activityLogger";

async function handler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
    const hasStaticAccess = effectiveRoles.some(r => (PERMISSIONS.CREATE_LAPTOP as string[]).includes(r));
    if (!hasStaticAccess) {
      const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/laptops", "create");
      if (!dyn.allowed) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();

    // ── Auto-Dedup Check ─────────────────────────────────────────────────
    // Compute hash dari 6 field (brand+name+cpu+ram+storage+gpu).
    // Kalau ada laptop existing dengan hash sama → return existing (TIDAK create baru).
    // Konsekuensi: client (AddLaptopModal) nerima laptop.id yang existing,
    // unit baru yang akan ditambahkan setelah ini akan nempel ke card existing,
    // bukan bikin card duplikat. Ini sesuai permintaan user: "data sama persis
    // otomatis masuk ke card yang sama".
    const dedupHash = await computeDedupHash({
      brand: body.brand ?? null,
      laptop_name: body.laptop_name ?? null,
      cpu: body.cpu ?? null,
      ram: body.ram ?? null,
      storage: body.storage ?? null,
      gpu: body.gpu ?? null,
    });

    const { data: existingLaptop } = await supabase
      .from("laptops")
      .select("*")
      .eq("dedup_hash", dedupHash)
      .limit(1)
      .maybeSingle();

    if (existingLaptop) {
      // Ada laptop dgn hash sama → return existing. Client lanjut add unit
      // ke laptop.id ini seperti biasa (via /api/laptops/[id]/units).
      try {
        await logActivity({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "CREATE", entity: "laptop", entityId: existingLaptop.id,
          entityLabel: `${existingLaptop.laptop_name} — DEDUP: dipakai card existing`,
        });
      } catch { /* non-blocking */ }
      return NextResponse.json({
        success: true,
        data: existingLaptop,
        was_deduplicated: true,
        message: `Laptop "${existingLaptop.laptop_name}" sudah ada di sistem — unit baru akan ditambahkan ke card existing (bukan bikin card baru).`,
      });
    }

    // Tidak ada match → insert laptop baru dengan dedup_hash terisi
    const { data: laptop, error } = await supabase
      .from("laptops")
      .insert({
        laptop_name: body.laptop_name,
        category_id: body.category_id || null,
        brand: body.brand,
        cpu: body.cpu,
        ram: body.ram,
        storage: body.storage,
        gpu: body.gpu,
        display: body.display,
        serial_number: body.serial_number,
        purchase_price: Math.round(Number(body.purchase_price) || 0),
        selling_price: Math.round(Number(body.selling_price) || 0),
        qty: 0,
        status: "BELUM_SIAP",
        condition_note: body.condition_note,
        notes: body.notes,
        dedup_hash: dedupHash,  // ← simpan hash supaya laptop berikutnya bisa auto-dedup
        // Checklist tes kondisi cuma boleh diisi editor (lihat canEditConditionChecks).
        ...(canEditConditionChecks(user.id, user.roles ?? [user.role]) && body.condition_checks !== undefined && {
          condition_checks: sanitizeConditionChecks(body.condition_checks),
        }),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

   try {
      await logActivity({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "CREATE",
        entity: "laptop",
        entityId: laptop.id,
        entityLabel: laptop.laptop_name,
        afterData: laptop,
      });
    } catch (logErr) {
      // Laptop SUDAH tersimpan di titik ini — kegagalan logging
      // tidak boleh membuat response ke user jadi "gagal".
      console.error("logActivity gagal (laptop tetap tersimpan):", logErr);
    }

    return NextResponse.json({ success: true, data: laptop });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);