// app/api/laptops/qc/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 REWORK (2026-11-20) — SN-First QC Paradigm
//
// Perubahan utama:
//   1. SUPPORT SN LEPAS (laptop_id=NULL) — unit tanpa folder bisa diproses QC.
//      Field model disimpan di laptop_units level (fallback dari laptop null).
//   2. 5 FIELD PENGUNCI VALIDATION (Q2 B) — kalau unit di folder isi dan Team QC
//      ubah field pengunci (nama/spek/harga jual/grade) → AUTO EJECT unit jadi
//      SN Lepas (laptop_id=NULL), bukan rusak folder.
//   3. AUTO-SUGGEST FOLDER (Q3 A) — Setelah QC_DONE untuk SN Lepas, response
//      include suggest_folders (folder match 5 pengunci) → UI tampilin modal.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";
import { isUnitQcComplete, getMissingQcFields } from "@/lib/qcCriteria";
import { logActivity } from "@/lib/activityLogger";
import { recalcLaptopParentQty } from "@/lib/laptopStock";

const TEAM_QC_ROLES: UserRole[] = [
  "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
  "KEPALA_ADMIN_BARANG", "ADMIN_BARANG",
] as UserRole[];

// ─── GET /api/laptops/qc ───────────────────────────────────────────────
async function getHandler(_req: NextRequest, _ctx: unknown, _user: AuthUser) {
  try {
    const { data, error } = await supabase
      .from("laptop_units")
      .select(`
        *,
        laptop:laptops (
          id, laptop_name, brand, cpu, ram, storage, gpu, display,
          condition_note, selling_price
        )
      `)
      .eq("qc_status", "NEEDS_QC")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    // Enrich: effective laptop = laptop parent OR fallback ke unit fields (SN Lepas)
    const enriched = (data ?? []).map((u: Record<string, any>) => {
      const effectiveLaptop = u.laptop ?? {
        id: null,
        laptop_name: u.name ?? null,
        brand: u.brand ?? null,
        cpu: u.cpu ?? null,
        ram: u.ram ?? null,
        storage: u.storage ?? null,
        gpu: u.gpu ?? null,
        display: u.display ?? null,
      };
      return {
        ...u,
        laptop: effectiveLaptop,
        is_sn_lepas: u.laptop_id === null,
        missing_fields: getMissingQcFields(
          u as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
          effectiveLaptop as unknown as import("@/lib/qcCriteria").LaptopForQc
        ),
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    console.error("[qc GET]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ─── POST /api/laptops/qc ──────────────────────────────────────────────
// Submit kriteria QC.
// Logic 2-case:
//   CASE A — Unit di folder isi (laptop_id != NULL):
//     - Cek apakah akan ubah 5 field pengunci (nama/spek/harga jual/grade)
//     - YA → AUTO EJECT: unit.laptop_id=NULL + copy identitas folder ke unit
//     - TIDAK → update laptops (broadcast) + update laptop_units
//   CASE B — SN Lepas (laptop_id = NULL):
//     - Semua field disave di laptop_units saja
async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    const { unit_id, updates } = await req.json();

    if (!unit_id || !updates || typeof updates !== "object") {
      return NextResponse.json({ success: false, message: "unit_id dan updates wajib" }, { status: 400 });
    }

    const { data: unit, error: fetchErr } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(*)")
      .eq("id", unit_id)
      .single();

    if (fetchErr || !unit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    // Field yang di-save di level unit (termasuk field model via mirror kolom)
    // ⬅️ FIX 2026-11-27: tambah "branch" — tanpa ini, perubahan cabang di Team QC
    //    tidak pernah ter-save ke DB, akibatnya Data Barang tetap tampilin cabang lama.
    const UNIT_FIELDS = ["serial_number", "grade", "source", "condition_note",
                         "purchase_price", "sparepart_cost", "selling_price", "official_price",
                         "name", "brand", "cpu", "ram", "storage", "gpu", "display",
                         "branch"];
    // Field yang di-broadcast ke parent laptops (Case A non-eject only)
    const LAPTOP_FIELDS = ["brand", "cpu", "ram", "storage", "laptop_name", "gpu", "display", "selling_price"];

    const unitUpdates: Record<string, any> = {};
    const laptopUpdates: Record<string, any> = {};

    for (const [k, v] of Object.entries(updates)) {
      if (UNIT_FIELDS.includes(k)) unitUpdates[k] = v;
      // Kirim 'laptop_name' → simpan juga di unit.name (biar SN Lepas tetap punya nama)
      if (k === "laptop_name") unitUpdates["name"] = v;
      if (LAPTOP_FIELDS.includes(k)) laptopUpdates[k] = v;
    }

    const isInFolder = unit.laptop_id !== null && unit.laptop != null;
    let wasEjected = false;

    if (isInFolder) {
      // CASE A — Unit di folder isi, cek 5 field pengunci
      const folder = unit.laptop;
      const willChangeLockedField =
        (updates.laptop_name !== undefined && (updates.laptop_name || null) !== (folder.laptop_name || null)) ||
        (updates.selling_price !== undefined && Number(updates.selling_price) !== Number(folder.selling_price ?? 0)) ||
        (updates.cpu !== undefined && (updates.cpu || null) !== (folder.cpu || null)) ||
        (updates.ram !== undefined && (updates.ram || null) !== (folder.ram || null)) ||
        (updates.storage !== undefined && (updates.storage || null) !== (folder.storage || null)) ||
        (updates.gpu !== undefined && (updates.gpu || null) !== (folder.gpu || null)) ||
        (updates.display !== undefined && (updates.display || null) !== (folder.display || null)) ||
        (updates.grade !== undefined && (updates.grade || null) !== (unit.grade || null));

      if (willChangeLockedField) {
        // AUTO EJECT — unit keluar folder jadi SN Lepas
        // ⬅️ FIX 2026-11-27: inherit `category` dari folder parent biar SN Lepas
        //    hasil eject TIDAK tampil "TANPA KATEGORI" di Data Barang. Tanpa baris
        //    ini, user harus manual re-set kategori sebelum bisa pindahkan unit ke
        //    folder lain, karena filter kategori di UI match by name text.
        const ejectData: Record<string, any> = {
          ...unitUpdates,
          laptop_id: null,
          category: folder.category ?? null,
          name: updates.laptop_name ?? folder.laptop_name,
          brand: updates.brand ?? folder.brand,
          cpu: updates.cpu ?? folder.cpu,
          ram: updates.ram ?? folder.ram,
          storage: updates.storage ?? folder.storage,
          gpu: updates.gpu ?? folder.gpu,
          display: updates.display ?? folder.display,
          selling_price: updates.selling_price !== undefined
            ? Number(updates.selling_price)
            : folder.selling_price,
        };

        const { error: ejectErr } = await supabase
          .from("laptop_units").update(ejectData).eq("id", unit_id);
        if (ejectErr) {
          return NextResponse.json({ success: false, message: `Eject gagal: ${ejectErr.message}` }, { status: 400 });
        }

        // Recalc folder qty karena unit keluar
        await recalcLaptopParentQty(supabase, unit.laptop_id);
        wasEjected = true;
      } else {
        // Normal update — broadcast ke folder + unit
        if (Object.keys(laptopUpdates).length > 0) {
          const { error: lErr } = await supabase
            .from("laptops").update(laptopUpdates).eq("id", unit.laptop_id);
          if (lErr) {
            return NextResponse.json({ success: false, message: `Update laptop: ${lErr.message}` }, { status: 400 });
          }
        }
        if (Object.keys(unitUpdates).length > 0) {
          const { error: uErr } = await supabase
            .from("laptop_units").update(unitUpdates).eq("id", unit_id);
          if (uErr) {
            return NextResponse.json({ success: false, message: `Update unit: ${uErr.message}` }, { status: 400 });
          }
        }
      }
    } else {
      // CASE B — SN Lepas, semua field di laptop_units saja
      if (Object.keys(unitUpdates).length > 0) {
        const { error: uErr } = await supabase
          .from("laptop_units").update(unitUpdates).eq("id", unit_id);
        if (uErr) {
          return NextResponse.json({ success: false, message: `Update unit: ${uErr.message}` }, { status: 400 });
        }
      }
    }

    // Re-fetch fresh state
    const { data: fresh } = await supabase
      .from("laptop_units")
      .select("*, laptop:laptops(*)")
      .eq("id", unit_id)
      .single();

    if (!fresh) {
      return NextResponse.json({ success: false, message: "Gagal re-fetch unit" }, { status: 500 });
    }

    // Build effective laptop (fallback dari unit kalau SN Lepas)
    const effectiveLaptop = fresh.laptop ?? {
      laptop_name: fresh.name ?? null,
      brand: fresh.brand ?? null,
      cpu: fresh.cpu ?? null,
      ram: fresh.ram ?? null,
      storage: fresh.storage ?? null,
      gpu: fresh.gpu ?? null,
      display: fresh.display ?? null,
    };

    const isComplete = isUnitQcComplete(
      fresh as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
      effectiveLaptop as unknown as import("@/lib/qcCriteria").LaptopForQc
    );
    let finalQcStatus = fresh.qc_status;
    let finalStatus = fresh.status;
    let suggestFolders: any[] = [];

    if (isComplete) {
      finalQcStatus = "QC_DONE";
      finalStatus = "SIAP_JUAL";

      await supabase.from("laptop_units").update({
        qc_status: "QC_DONE",
        status: "SIAP_JUAL",
        qc_completed_at: new Date().toISOString(),
        qc_completed_by: user.id,
      }).eq("id", unit_id);

      await supabase.from("qc_history").insert({
        unit_id,
        laptop_id: fresh.laptop_id,
        from_qc_status: fresh.qc_status,
        to_qc_status: "QC_DONE",
        from_status: fresh.status,
        to_status: "SIAP_JUAL",
        actor_user_id: user.id,
        actor_name: user.name,
        reason: wasEjected
          ? "Kriteria QC lengkap — unit ter-eject dari folder lama (ubah 5 field pengunci), auto SIAP_JUAL (SN Lepas)"
          : "Kriteria QC lengkap — otomatis naik ke SIAP_JUAL",
      });

      await logActivity({
        userId: user.id, userName: user.name, userRole: user.role,
        action: "EDIT", entity: "unit", entityId: unit_id,
        entityLabel: `SN: ${fresh.serial_number} — QC selesai${wasEjected ? " (ter-eject jadi SN Lepas)" : ""}`,
        afterData: { qc_status: "QC_DONE", status: "SIAP_JUAL" },
      });

      // Q3 A — Auto-suggest folder match untuk SN Lepas (termasuk yg baru ter-eject)
      if (fresh.laptop_id === null) {
        let matchQuery = supabase
          .from("laptops")
          .select("id, laptop_name, brand, cpu, ram, storage, gpu, display, selling_price, grade, category, device_type")
          .eq("laptop_name", effectiveLaptop.laptop_name ?? "")
          .eq("selling_price", fresh.selling_price ?? 0)
          .is("archived_at", null)
          .not("laptop_name", "is", null); // exclude folder kosong

        if (fresh.grade) matchQuery = matchQuery.eq("grade", fresh.grade);
        else matchQuery = matchQuery.is("grade", null);

        for (const [col, val] of [
          ["cpu", effectiveLaptop.cpu], ["ram", effectiveLaptop.ram],
          ["storage", effectiveLaptop.storage], ["gpu", effectiveLaptop.gpu],
          ["display", effectiveLaptop.display],
        ] as const) {
          matchQuery = val !== null ? matchQuery.eq(col, val) : matchQuery.is(col, null);
        }

        const { data: matchingFolders } = await matchQuery;
        suggestFolders = matchingFolders ?? [];
      }
    }

    return NextResponse.json({
      success: true,
      is_complete: isComplete,
      qc_status: finalQcStatus,
      status: finalStatus,
      was_ejected: wasEjected,
      suggest_folders: suggestFolders,
      missing_fields: isComplete ? [] : getMissingQcFields(
        fresh as unknown as import("@/lib/qcCriteria").LaptopUnitForQc,
        effectiveLaptop as unknown as import("@/lib/qcCriteria").LaptopForQc
      ),
    });
  } catch (err) {
    console.error("[qc POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(getHandler, TEAM_QC_ROLES);
export const POST = withAuth(postHandler, TEAM_QC_ROLES);