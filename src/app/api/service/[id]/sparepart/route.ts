// src/app/api/service/[id]/sparepart/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { expandRolesWithParents, hasAnyRole } from "@/lib/permissions";
import { createClient } from "@supabase/supabase-js";
import { AKUN, jakartaDate, periodFromDate, totalOf } from "@/lib/accounting";
import { draftToLineRows } from "@/lib/accountingSource";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getAuthUser(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

function getEffectiveRoles(user: { role: string; roles?: string[] }): string[] {
  return expandRolesWithParents(user.roles ?? [user.role]);
}

// Insert jurnal reversal — pola sama persis insertSparepartJournal di [id]/route.ts,
// cuma debit/kredit DIBALIK. Best-effort: kalau jurnal gagal, pembatalan tetap lanjut
// (stok/outflow sudah di-rollback duluan, jadi gak bikin inkonsistensi inventaris).
async function insertSparepartReversalJournal(
  supabase: ReturnType<typeof getAdmin>,
  opts: {
    nominal: number;
    mode: "stock" | "manual";
    nama: string | null;
    laptop: string | null;
    userId: string;
  }
) {
  try {
    const tanggal = jakartaDate(new Date().toISOString());
    const period = periodFromDate(tanggal);

    // STOCK reversal:  D 170 (Aksesoris), K 450 (Biaya Printilan)  ← kebalik dari D450/K170
    // MANUAL reversal: D 171 (Aksesoris Service), K 460 (Modal Service Keluar) ← kebalik dari D460/K171
    const [debit, kredit] =
      opts.mode === "stock"
        ? [AKUN.AKSESORIS, AKUN.BIAYA_PRINTILAN]
        : [AKUN.AKSESORIS_SERVICE, AKUN.MODAL_SERVICE_KELUAR];

    const laptopLabel = opts.laptop ?? "—";
    const customerLabel = opts.nama ?? "—";
    const keterangan = `Pembatalan Sparepart (${opts.mode === "stock" ? "stok" : "manual"}) · ${laptopLabel} - ${customerLabel}`;

    const lines = [
      { account_code: debit, side: "DEBIT" as const, nominal: opts.nominal },
      { account_code: kredit, side: "KREDIT" as const, nominal: opts.nominal },
    ];

    const { data: entry, error } = await supabase
      .from("journal_entries")
      .insert({
        period,
        tanggal,
        keterangan,
        ref: null,
        source_type: "MANUAL",
        source_id: null,
        source_category: "SPAREPART_SERVICE_REVERSAL",
        total: totalOf(lines),
        created_by: opts.userId,
      })
      .select("id")
      .single();
    if (error || !entry) {
      console.error("[sparepart reversal] entry:", error?.message);
      return;
    }

    const { error: lineErr } = await supabase
      .from("journal_lines")
      .insert(draftToLineRows(entry.id, lines));
    if (lineErr) {
      await supabase.from("journal_entries").delete().eq("id", entry.id);
      console.error("[sparepart reversal] lines:", lineErr.message);
      return;
    }

    await supabase.from("journal_audit_logs").insert({
      entry_id: entry.id,
      period,
      action: "CREATE",
      before_data: null,
      after_data: { tanggal, keterangan, lines },
      changed_by: opts.userId,
    });
  } catch (e) {
    console.error("[sparepart reversal] exception:", e);
  }
}

// ── DELETE /api/service/[id]/sparepart ─────────────────────────────────────
// Body: { line_content: string }  — isi baris sparepart_items yg mau dihapus (format "label§harga")
// Pakai line_content (bukan index) biar aman kalau ada concurrent edit yg mengubah urutan baris.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  // Hanya ADMIN & CS yg boleh hapus — konsisten dgn penanda service ([[solit-pos-service-penanda]])
  if (
    !hasAnyRole(getEffectiveRoles(user), [
      "ADMIN", "PROGRAMMER", "ASISTEN_CEO",
      "CUSTOMER_SERVICE", "PKL_CUSTOMER_SERVICE",
    ])
  ) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ success: false, message: "ID tidak valid" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const lineContent = (body?.line_content ?? "").toString().trim();
  if (!lineContent) {
    return NextResponse.json({ success: false, message: "line_content wajib diisi" }, { status: 400 });
  }

  const supabase = getAdmin();

  // Ambil order + sparepart_items saat ini
  const { data: current, error: fetchErr } = await supabase
    .from("service_orders")
    .select("id, nama, type_laptop, sparepart_items, biaya_sparepart, status, no_urut")
    .eq("id", id)
    .single();
  if (fetchErr || !current) {
    return NextResponse.json({ success: false, message: "Order tidak ditemukan" }, { status: 404 });
  }

  const existingLines = (current.sparepart_items ?? "")
    .split("\n")
    .map((s: string) => s.trim())
    .filter(Boolean);
  const targetIdx = existingLines.findIndex((l: string) => l === lineContent);
  if (targetIdx === -1) {
    return NextResponse.json(
      { success: false, message: "Baris sparepart tidak ditemukan (mungkin sudah dihapus)" },
      { status: 404 }
    );
  }

  // Parse label + harga
  const [label, hargaRaw] = lineContent.split("§");
  const harga = Math.max(0, Math.round(Number(hargaRaw ?? 0)));

  // Deteksi mode: STOCK vs MANUAL
  // STOCK  → label mengandung "(SN XXX)" DAN SN itu match accessory_outflow aktif service ini
  // MANUAL → selain itu (termasuk reason manual yg kebetulan mengandung "(SN ...)")
  const snMatch = (label ?? "").match(/\(SN\s+([^)]+)\)/i);
  let mode: "stock" | "manual" = "manual";
  let targetOutflow: {
    id: string;
    accessory_id: string;
    unit_id: string | null;
    qty: number;
  } | null = null;

  if (snMatch?.[1]) {
    const sn = snMatch[1].trim();
    const { data: unitRow } = await supabase
      .from("accessory_units")
      .select("id, accessory_id")
      .eq("serial_number", sn)
      .maybeSingle();
    if (unitRow) {
      const { data: outflow } = await supabase
        .from("accessory_outflows")
        .select("id, accessory_id, unit_id, qty")
        .eq("service_id", id)
        .eq("unit_id", unitRow.id)
        .eq("status", "active")
        .maybeSingle();
      if (outflow) {
        mode = "stock";
        targetOutflow = outflow;
      }
    }
  }

  // ── Eksekusi pembatalan ──────────────────────────────────────────────────
  if (mode === "stock" && targetOutflow) {
    // 1) Outflow aktif → cancelled (biar jejak audit tetap ada)
    await supabase
      .from("accessory_outflows")
      .update({ status: "cancelled" })
      .eq("id", targetOutflow.id);

    // 2) Unit balik ke TERSEDIA (unit ini sebelumnya sudah lolos QC & dipakai,
    //    jadi balikin ke stok siap-jual, bukan BELUM_SIAP seperti restore transaksi)
    if (targetOutflow.unit_id) {
      await supabase
        .from("accessory_units")
        .update({ status: "TERSEDIA" })
        .eq("id", targetOutflow.unit_id);
    }

    // 3) Increment stok di accessories
    const { data: acc } = await supabase
      .from("accessories")
      .select("stock")
      .eq("id", targetOutflow.accessory_id)
      .maybeSingle();
    if (acc) {
      await supabase
        .from("accessories")
        .update({
          stock: (Number(acc.stock) || 0) + Number(targetOutflow.qty || 1),
        })
        .eq("id", targetOutflow.accessory_id);
    }
  } else {
    // MANUAL → kurangi biaya_sparepart sebesar harga line (clamp ke 0)
    const currentBiaya = Math.max(0, Math.round(Number(current.biaya_sparepart ?? 0)));
    const newBiaya = Math.max(0, currentBiaya - harga);
    await supabase
      .from("service_orders")
      .update({ biaya_sparepart: newBiaya })
      .eq("id", id);
  }

  // Hapus line dari sparepart_items + simpan
  const nextLines = [...existingLines];
  nextLines.splice(targetIdx, 1);
  const newSparepartItems = nextLines.join("\n");

  const { data: updated, error: updateErr } = await supabase
    .from("service_orders")
    .update({ sparepart_items: newSparepartItems || null })
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json({ success: false, message: updateErr.message }, { status: 500 });
  }

  // Jurnal reversal (best-effort, gak blok response)
  if (harga > 0) {
    await insertSparepartReversalJournal(supabase, {
      nominal: harga,
      mode,
      nama: current.nama,
      laptop: current.type_laptop,
      userId: user.id,
    });
  }

  // Log ke service_order_logs (status tidak berubah)
  await supabase.from("service_order_logs").insert({
    service_order_id: id,
    status_from: current.status,
    status_to: current.status,
    catatan: `Sparepart dihapus (${mode}): ${label}${
      harga > 0 ? ` · Rp ${harga.toLocaleString("id-ID")}` : ""
    }`,
    changed_by: user.id,
  });

  return NextResponse.json({ success: true, data: updated });
}