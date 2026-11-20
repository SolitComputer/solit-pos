// src/app/api/data-barang/unit/[unitId]/move/route.ts
//
// POST — Pindahkan unit ke folder tujuan ATAU ke etalase (SN Lepas).
// Body: { target_folder_id: string | null }
//
// Logic:
//   1. Validasi unit nggak OUT_STATUSES (SOLD/KELUAR/dll)
//   2. Kalau target_folder_id = null → set unit.{laptop_id/accessory_id} = NULL
//   3. Kalau target_folder_id != null:
//      a. Fetch target folder
//      b. Cek kompatibilitas 5 field pengunci STRICT (tolak kalau beda)
//      c. Kalau folder kosong (identitas NULL) → adopt identitas dari unit
//      d. Update unit.{laptop_id/accessory_id} = target_folder_id
//   4. Folder asal: cek sisa unit → kalau habis (0 unit), RESET identitas
//      folder jadi NULL (Edge 1 Opsi B — konfirmasi Rayhan 2026-11-20)

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { UserRole } from "@/lib/permissions";

const ALLOWED_ROLES: UserRole[] = ["ADMIN", "KEPALA_ADMIN_BARANG", "ADMIN_BARANG"];

const OUT_STATUSES = ["SOLD", "TERJUAL", "KELUAR", "RETURNED", "RESERVED", "HELD", "PACKING", "PENDING"];

interface Props { params: Promise<{ unitId: string }>; }

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { unitId } = await props.params;
    const body = await req.json();
    const { target_folder_id } = body as { target_folder_id: string | null };

    // Deteksi unit
    const { data: lapUnit } = await supabase.from("laptop_units")
      .select("*").eq("id", unitId).maybeSingle();
    const { data: accUnit } = !lapUnit ? await supabase.from("accessory_units")
      .select("*").eq("id", unitId).maybeSingle() : { data: null };

    if (!lapUnit && !accUnit) {
      return NextResponse.json({ success: false, message: "Unit tidak ditemukan" }, { status: 404 });
    }

    const isLaptop = !!lapUnit;
    const unit = (lapUnit ?? accUnit)!;
    const unitTable = isLaptop ? "laptop_units" : "accessory_units";
    const folderTable = isLaptop ? "laptops" : "accessories";
    const fkCol = isLaptop ? "laptop_id" : "accessory_id";
    const currentFolderId = unit[fkCol] as string | null;

    // Validasi: unit bukan out-status
    if (OUT_STATUSES.includes(unit.status)) {
      return NextResponse.json({
        success: false,
        message: `Unit dengan status ${unit.status} tidak bisa dipindahkan`,
      }, { status: 400 });
    }

    // No-op: pindah ke folder yang sama
    if (currentFolderId === target_folder_id) {
      return NextResponse.json({
        success: false,
        message: "Unit sudah berada di folder tersebut",
      }, { status: 400 });
    }

    // ─── Kalau target != null: validasi folder tujuan ────────────────────
    if (target_folder_id !== null) {
      const { data: targetFolder, error: tErr } = await supabase
        .from(folderTable).select("*").eq("id", target_folder_id).single();
      if (tErr || !targetFolder) {
        return NextResponse.json({ success: false, message: "Folder tujuan tidak ditemukan" }, { status: 404 });
      }

      // Cek: apakah folder kosong (identitas detail NULL)?
      const nameField = isLaptop ? "laptop_name" : "name";
      const isEmpty = targetFolder[nameField] === null;

      if (isEmpty) {
        // Folder kosong: adopt identitas dari unit + validate category match
        if (targetFolder.category !== unit.category) {
          return NextResponse.json({
            success: false,
            message: `Kategori unit (${unit.category}) berbeda dengan folder tujuan (${targetFolder.category})`,
          }, { status: 400 });
        }

        // Adopt 5 field pengunci + field lain
        const adoptData: Record<string, any> = isLaptop ? {
          laptop_name: unit.laptop_name,
          brand: unit.brand, cpu: unit.cpu, ram: unit.ram, storage: unit.storage,
          gpu: unit.gpu, display: unit.display,
          selling_price: unit.selling_price, grade: unit.grade,
        } : {
          name: unit.name, brand: unit.brand, spec: unit.spec,
          sell_price: unit.sell_price, grade: unit.grade,
        };

        const { error: adoptErr } = await supabase.from(folderTable)
          .update(adoptData).eq("id", target_folder_id);
        if (adoptErr) return NextResponse.json({ success: false, message: adoptErr.message }, { status: 400 });
      } else {
        // Folder isi: STRICT validation 5 field pengunci
        const mismatches: string[] = [];
        if (targetFolder.category !== unit.category) mismatches.push("Kategori");
        if (targetFolder[nameField] !== unit[nameField]) mismatches.push("Nama");
        if (targetFolder.grade !== unit.grade) mismatches.push("Grade");

        if (isLaptop) {
          if (targetFolder.selling_price !== unit.selling_price) mismatches.push("Harga Jual");
          for (const col of ["cpu", "ram", "storage", "gpu", "display"] as const) {
            if (targetFolder[col] !== unit[col]) mismatches.push(col.toUpperCase());
          }
        } else {
          if (targetFolder.sell_price !== unit.sell_price) mismatches.push("Harga Jual");
          for (const col of ["brand", "spec"] as const) {
            if (targetFolder[col] !== unit[col]) mismatches.push(col === "brand" ? "Brand" : "Spek");
          }
        }

        if (mismatches.length > 0) {
          return NextResponse.json({
            success: false,
            message: `Spec unit tidak match dengan folder tujuan di field: ${mismatches.join(", ")}. Edit unit dulu atau pilih folder lain.`,
          }, { status: 400 });
        }
      }
    }

    // ─── Pindahkan unit ───────────────────────────────────────────────────
    const { error: moveErr } = await supabase.from(unitTable)
      .update({ [fkCol]: target_folder_id }).eq("id", unitId);
    if (moveErr) return NextResponse.json({ success: false, message: moveErr.message }, { status: 400 });

    // ─── Folder asal: cek sisa unit, kalau habis → RESET identitas (Edge 1 B)
    if (currentFolderId !== null) {
      const { count: sisaCount } = await supabase
        .from(unitTable)
        .select("id", { count: "exact", head: true })
        .eq(fkCol, currentFolderId)
        .not("status", "in", `(${OUT_STATUSES.join(",")})`);

      if ((sisaCount ?? 0) === 0) {
        // Folder habis: RESET identitas detail jadi NULL (Opsi B)
        // Type + Kategori tetap, cuma identitas detail yang reset
        const resetData: Record<string, any> = isLaptop ? {
          laptop_name: null, brand: null, cpu: null, ram: null, storage: null,
          gpu: null, display: null, selling_price: null, grade: null,
          is_mixed_grade: false,
        } : {
          name: null, brand: null, spec: null,
          buy_price: null, sell_price: null, grade: null,
          is_mixed_grade: false,
        };
        await supabase.from(folderTable).update(resetData).eq("id", currentFolderId);
      }
    }

    return NextResponse.json({
      success: true,
      message: target_folder_id === null
        ? "Unit dipindahkan ke etalase (SN Lepas)"
        : "Unit berhasil dipindahkan",
      new_folder_id: target_folder_id,
    });
  } catch (err) {
    console.error("[unit/move]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const POST = withAuth(postHandler, ALLOWED_ROLES);