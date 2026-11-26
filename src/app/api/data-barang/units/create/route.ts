// src/app/api/data-barang/units/create/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 REWORK (2026-11-20) — Explicit Target Folder
// Endpoint: POST /api/data-barang/units/create
//
// Paradigma baru: USER pilih target folder secara EXPLICIT.
//   target_folder_id = string UUID → Case A atau B (auto-detect isi/kosong)
//   target_folder_id = null         → Case C (SN Lepas, laptop_id=NULL)
//
// Case A — Folder ISI:
//   Validasi 5 field pengunci STRICT match (nama, spek, harga jual, grade,
//   kategori). Mismatch → 400 reject dengan list field yang beda.
// Case B — Folder KOSONG (identitas detail NULL):
//   Insert unit + UPDATE folder adopt identitas dari unit (nama, brand,
//   cpu, ram, storage, gpu, display, harga jual, grade).
// Case C — Tanpa Folder:
//   Insert unit dengan laptop_id=NULL (atau accessory_id=NULL). SN Lepas.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { expandRolesWithParents } from "@/lib/permissions";
import { checkDynamicPageAccess } from "@/lib/dynamicPermissions";
import { logActivity } from "@/lib/activityLogger";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { recalcAccessoryParentStock } from "@/lib/accessoryStock";

const OFFICIAL_PRICE_MARKUP = 300_000;

async function postHandler(req: NextRequest, _ctx: unknown, user: AuthUser) {
  try {
    // ── Permission check ──────────────────────────────────────────────────
    const effectiveRoles = expandRolesWithParents(user.roles ?? [user.role]);
    const hasStaticAccess = effectiveRoles.some(r =>
      (PERMISSIONS.CREATE_UNITS as string[]).includes(r)
    );
    if (!hasStaticAccess) {
      const dyn = await checkDynamicPageAccess(effectiveRoles, "/dashboard/data-barang", "create");
      if (!dyn.allowed) {
        return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const {
      tipe,
      category_id,
      target_folder_id,       // string UUID = ke folder; null = SN Lepas
      serial_number,
      name, brand,
      cpu, ram, storage, gpu, display,
      spec,
      grade, condition,
      purchase_price, sparepart_cost, buy_price, selling_price,
      source, branch, notes,
      condition_note, kelengkapan, condition_checks,
    } = body;

    // ── Validasi dasar ─────────────────────────────────────────────────
    if (tipe !== "LAPTOP" && tipe !== "AKSESORIS") {
      return NextResponse.json({ success: false, message: "Tipe wajib LAPTOP atau AKSESORIS" }, { status: 400 });
    }
    if (!serial_number?.trim()) {
      return NextResponse.json({ success: false, message: "Serial number wajib diisi" }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ success: false, message: "Nama barang wajib diisi" }, { status: 400 });
    }
    if (!category_id) {
      return NextResponse.json({ success: false, message: "Kategori wajib dipilih" }, { status: 400 });
    }

    // Ambil nama kategori dari laptop_categories
    const { data: cat } = await supabaseAdmin
      .from("laptop_categories")
      .select("name, type")
      .eq("id", category_id)
      .maybeSingle();
    if (!cat) {
      return NextResponse.json({ success: false, message: "Kategori tidak ditemukan" }, { status: 400 });
    }

    const safeBranch = branch === "UTAMA" || branch === "JOGJA" ? branch : null;
    const sellingPriceNum = selling_price != null && selling_price !== ""
      ? Math.round(Number(selling_price)) : null;

    // ═══════════════════════════════════════════════════════════════════
    // FLOW LAPTOP
    // ═══════════════════════════════════════════════════════════════════
    if (tipe === "LAPTOP") {
      // 1. Cek duplikat SN GLOBAL
      const { data: existingSn } = await supabaseAdmin
        .from("laptop_units")
        .select("id, serial_number, laptop:laptops(laptop_name)")
        .eq("serial_number", serial_number.trim())
        .limit(1);

      if (existingSn && existingSn.length > 0) {
        const dup = existingSn[0] as any;
        const lap = Array.isArray(dup.laptop) ? dup.laptop[0] : dup.laptop;
        const lokasi = lap?.laptop_name ? ` pada "${lap.laptop_name}"` : "";
        return NextResponse.json({
          success: false,
          message: `Serial number "${serial_number}" sudah terdaftar${lokasi}`,
        }, { status: 409 });
      }

      let parentLaptopId: string | null = null;
      let wasExistingParent = false;
      let caseDetected: "A" | "B" | "C" = "C";
      const deviceType = cat.name.trim().toUpperCase() === "PC" ? "PC" : "LAPTOP";

      // 2. Handle target folder
      if (target_folder_id) {
        const { data: tFolder, error: tErr } = await supabaseAdmin
          .from("laptops")
          .select("*")
          .eq("id", target_folder_id)
          .maybeSingle();
        if (tErr || !tFolder) {
          return NextResponse.json({ success: false, message: "Folder tujuan tidak ditemukan" }, { status: 404 });
        }

        // Auto-reactivate: kalau folder archived/SOLD, un-archive
        // supaya unit baru muncul di Data Barang
        if (tFolder.archived_at || tFolder.status === "SOLD") {
          const { error: reactivateErr } = await supabaseAdmin
            .from("laptops")
            .update({
              archived_at: null,
              archived_by: null,
              archive_reason: null,
              status: "SIAP_JUAL",
            })
            .eq("id", target_folder_id);
          if (reactivateErr) {
            console.error("[units/create] Gagal reactivate parent laptop:", reactivateErr.message);
          }
        }

        // FIX case-insensitive: cat.name dari laptop_categories bisa "Charger"
        // sementara tFolder.category dari laptops bisa "CHARGER". Pakai
        // normalisasi UPPERCASE + trim di dua sisi supaya tidak false reject.
        if ((tFolder.category ?? "").toUpperCase().trim() !== (cat.name ?? "").toUpperCase().trim()) {
          return NextResponse.json({
            success: false,
            message: `Kategori unit (${cat.name}) berbeda dengan folder tujuan (${tFolder.category})`,
          }, { status: 400 });
        }

        const isEmpty = tFolder.laptop_name === null;
        if (isEmpty) {
          // Case B — folder kosong → ADOPT identitas unit
          caseDetected = "B";
          const { error: adoptErr } = await supabaseAdmin.from("laptops").update({
            laptop_name: name.trim(),
            brand: brand || null,
            cpu: cpu || null, ram: ram || null, storage: storage || null,
            gpu: gpu || null, display: display || null,
            selling_price: sellingPriceNum,
            grade: grade || null,
          }).eq("id", target_folder_id);
          if (adoptErr) return NextResponse.json({ success: false, message: adoptErr.message }, { status: 400 });
        } else {
          // Case A — folder isi → STRICT validate 5 field pengunci
          caseDetected = "A";
          // FIX: kalau folder field kosong/null, SKIP validasi — artinya folder
          // belum pernah set field tsb. Mismatch hanya trigger kalau folder DAN
          // unit sama-sama punya value tapi beda.
          const mismatches: string[] = [];
          const fName = (tFolder.laptop_name ?? "").trim();
          const fCpu = (tFolder.cpu ?? "").trim();
          const fRam = (tFolder.ram ?? "").trim();
          const fStorage = (tFolder.storage ?? "").trim();
          const fGpu = (tFolder.gpu ?? "").trim();
          const fDisplay = (tFolder.display ?? "").trim();
          const fGrade = (tFolder.grade ?? "").trim();
          const fSellPrice = Number(tFolder.selling_price) || 0;

          if (fName && fName !== name.trim()) mismatches.push("Nama");
          if (fCpu && fCpu !== (cpu ?? "").trim()) mismatches.push("CPU");
          if (fRam && fRam !== (ram ?? "").trim()) mismatches.push("RAM");
          if (fStorage && fStorage !== (storage ?? "").trim()) mismatches.push("Storage");
          if (fGpu && fGpu !== (gpu ?? "").trim()) mismatches.push("GPU");
          if (fDisplay && fDisplay !== (display ?? "").trim()) mismatches.push("Display");
          if (fSellPrice > 0 && fSellPrice !== (sellingPriceNum ?? 0)) mismatches.push("Harga Jual");
          if (fGrade && fGrade !== (grade ?? "").trim()) mismatches.push("Grade");

          if (mismatches.length > 0) {
            return NextResponse.json({
              success: false,
              message: `Spec tidak match dengan folder tujuan di field: ${mismatches.join(", ")}. Perbaiki data atau pilih folder lain.`,
            }, { status: 400 });
          }
        }
        parentLaptopId = target_folder_id;
        wasExistingParent = true;
      }
      // else: parentLaptopId = null (Case C — SN Lepas)

      // 3. Insert unit
      const purchasePriceNum = purchase_price != null && purchase_price !== ""
        ? Math.round(Number(purchase_price)) : null;
      const sparepartNum = sparepart_cost != null && sparepart_cost !== ""
        ? Math.round(Number(sparepart_cost)) : null;

      const { data: newUnit, error: unitErr } = await supabaseAdmin
        .from("laptop_units")
        .insert({
          laptop_id: parentLaptopId,       // bisa null (SN Lepas)
          serial_number: serial_number.trim(),
          device_type: deviceType,
          category: cat.name,
          // Identitas per-SN
          name: name.trim(),
          brand: brand || null,
          cpu: cpu || null, ram: ram || null, storage: storage || null,
          gpu: gpu || null, display: display || null,
          grade: grade || "A",
          purchase_price: purchasePriceNum,
          selling_price: sellingPriceNum,
          sparepart_cost: sparepartNum,
          official_price: sellingPriceNum != null ? sellingPriceNum + OFFICIAL_PRICE_MARKUP : null,
          status: "BELUM_SIAP",
          qc_status: "NEEDS_QC",
          source: source || null,
          branch: safeBranch,
          notes: notes || null,
          condition_note: condition_note?.trim() || null,
          kelengkapan: kelengkapan ?? null,
          condition_checks: condition_checks ?? {},
        })
        .select()
        .single();
      if (unitErr) throw unitErr;

      // 4. Recalc parent qty kalau ada parent
      if (parentLaptopId) await recalcLaptopParentQty(supabaseAdmin, parentLaptopId);

      // 5. Log
      try {
        const caseLabel = caseDetected === "A" ? "masuk folder isi"
          : caseDetected === "B" ? "folder kosong di-adopt"
          : "SN Lepas (tanpa folder)";
        await logActivity({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "CREATE", entity: "unit", entityId: newUnit.id,
          entityLabel: `SN: ${newUnit.serial_number} (${name}) — ${caseLabel}`,
          afterData: newUnit,
        });
      } catch { /* non-blocking */ }

      return NextResponse.json({
        success: true,
        data: { unit: newUnit, parent_id: parentLaptopId, was_existing_parent: wasExistingParent, case: caseDetected },
        message: caseDetected === "A" ? `SN masuk ke folder existing "${name}"`
          : caseDetected === "B" ? `Folder kosong di-adopt + SN pertama masuk`
          : `SN Lepas (tanpa folder) tercipta`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // FLOW AKSESORIS
    // ═══════════════════════════════════════════════════════════════════
    if (tipe === "AKSESORIS") {
      const snUpper = serial_number.trim().toUpperCase();
      const { count: snExists } = await supabaseAdmin
        .from("accessory_units")
        .select("id", { count: "exact", head: true })
        .eq("serial_number", snUpper);
      if (snExists && snExists > 0) {
        return NextResponse.json({ success: false, message: `Serial number "${snUpper}" sudah digunakan` }, { status: 409 });
      }

      const buyPriceNum = buy_price != null && buy_price !== "" ? Math.max(0, Math.round(Number(buy_price))) : 0;
      let parentAccId: string | null = null;
      let wasExistingParent = false;
      let caseDetected: "A" | "B" | "C" = "C";

      if (target_folder_id) {
        const { data: tFolder, error: tErr } = await supabaseAdmin
          .from("accessories")
          .select("*")
          .eq("id", target_folder_id)
          .maybeSingle();
        if (tErr || !tFolder) {
          return NextResponse.json({ success: false, message: "Folder tujuan tidak ditemukan" }, { status: 404 });
        }

        // Auto-reactivate: kalau folder archived/SOLD, un-archive
        // supaya unit baru muncul di Data Barang
        if (tFolder.archived_at || tFolder.status === "SOLD") {
          const { error: reactivateErr } = await supabaseAdmin
            .from("accessories")
            .update({
              archived_at: null,
              archived_by: null,
              archive_reason: null,
              status: "TERSEDIA",
            })
            .eq("id", target_folder_id);
          if (reactivateErr) {
            console.error("[units/create] Gagal reactivate parent accessory:", reactivateErr.message);
          }
        }

        // FIX case-insensitive: cat.name dari laptop_categories bisa "Charger"
        // sementara tFolder.category dari accessories bisa "CHARGER". Pakai
        // normalisasi UPPERCASE + trim di dua sisi supaya tidak false reject.
        if ((tFolder.category ?? "").toUpperCase().trim() !== (cat.name ?? "").toUpperCase().trim()) {
          return NextResponse.json({
            success: false,
            message: `Kategori unit (${cat.name}) berbeda dengan folder tujuan (${tFolder.category})`,
          }, { status: 400 });
        }

        const isEmpty = tFolder.name === null;
        if (isEmpty) {
          // Case B
          caseDetected = "B";
          await supabaseAdmin.from("accessories").update({
            name: name.trim(), brand: brand || null, spec: spec || null,
            sell_price: sellingPriceNum ?? 0,
            // NOTE: `grade` dihapus — tabel accessories juga tidak punya kolom
            // grade (kemungkinan error serupa saat Case B / folder kosong).
          }).eq("id", target_folder_id);
        } else {
          // Case A — STRICT validate
          caseDetected = "A";
          // FIX: kalau folder field kosong/null, SKIP validasi — artinya folder
          // belum pernah set field tsb (umum untuk grade/brand/spec di aksesoris
          // karena UI Edit Folder Aksesoris tidak punya field Grade). Mismatch
          // hanya trigger kalau folder DAN unit sama-sama punya value tapi beda.
          const mismatches: string[] = [];
          const fName = (tFolder.name ?? "").trim();
          const fBrand = (tFolder.brand ?? "").trim();
          const fSpec = (tFolder.spec ?? "").trim();

          const fSellPrice = Number(tFolder.sell_price) || 0;

          if (fName && fName !== name.trim()) mismatches.push("Nama");
          if (fBrand && fBrand !== (brand ?? "").trim()) mismatches.push("Brand");
          if (fSpec && fSpec !== (spec ?? "").trim()) mismatches.push("Spek");
          if (fSellPrice > 0 && fSellPrice !== (sellingPriceNum ?? 0)) mismatches.push("Harga Jual");


          if (mismatches.length > 0) {
            return NextResponse.json({
              success: false,
              message: `Spec tidak match dengan folder tujuan di field: ${mismatches.join(", ")}. Perbaiki data atau pilih folder lain.`,
            }, { status: 400 });
          }
        }
        parentAccId = target_folder_id;
        wasExistingParent = true;
      }

      const safeCondition = condition === "BARU" || condition === "BEKAS" ? condition : "BARU";

      const { data: newUnit, error: unitErr } = await supabaseAdmin
        .from("accessory_units")
        .insert({
          accessory_id: parentAccId,     // bisa null (SN Lepas)
          serial_number: snUpper,
          device_type: "ACCESSORY",
          category: cat.name,
          name: name.trim(),
          brand: brand || null,
          spec: spec || null,
          // NOTE: field `grade` DIHAPUS — tabel accessory_units tidak punya
          // kolom grade (error PGRST204). Grade konsep laptop-only; di UI
          // modal aksesoris field grade ada tapi tidak dipersist ke DB.
          condition: safeCondition,
          status: "TERSEDIA",
          buy_price: buyPriceNum,
          selling_price: sellingPriceNum ?? 0,
          source: source?.trim() || null,
          branch: safeBranch,
          notes: notes?.trim() || null,
        })
        .select()
        .single();
      if (unitErr) throw unitErr;

      if (parentAccId) await recalcAccessoryParentStock(supabaseAdmin, parentAccId);

      try {
        const caseLabel = caseDetected === "A" ? "masuk folder isi"
          : caseDetected === "B" ? "folder kosong di-adopt"
          : "SN Lepas (tanpa folder)";
        await logActivity({
          userId: user.id, userName: user.name, userRole: user.role,
          action: "CREATE", entity: "unit", entityId: newUnit.id,
          entityLabel: `SN: ${newUnit.serial_number} (${name}) — ${caseLabel}`,
          afterData: newUnit,
        });
      } catch { /* non-blocking */ }

      return NextResponse.json({
        success: true,
        data: { unit: newUnit, parent_id: parentAccId, was_existing_parent: wasExistingParent, case: caseDetected },
        message: caseDetected === "A" ? `SN masuk ke folder existing "${name}"`
          : caseDetected === "B" ? `Folder kosong di-adopt + SN pertama masuk`
          : `SN Lepas (tanpa folder) tercipta`,
      });
    }

    return NextResponse.json({ success: false, message: "Tipe tidak dikenali" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/data-barang/units/create]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export const POST = withAuth(postHandler);