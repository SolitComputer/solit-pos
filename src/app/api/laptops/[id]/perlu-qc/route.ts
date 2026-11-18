import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { logActivity } from "@/lib/activityLogger";
import { recalcLaptopParentQty } from "@/lib/laptopStock";
import { BARANG_FULL_ACCESS_ROLES } from "@/lib/permissions";

interface Props {
  params: Promise<{ id: string }>;
}

// Unit yang sudah keluar dari gudang — SKIP (tidak di-reset ke NEEDS_QC).
// Bukan OUT_STATUSES versi UI (yang masukin RESERVED/HELD/dll sebagai "keluar"
// dari TAMPILAN stok); di sisi database hanya status final yang benar-benar
// sudah tidak ada barangnya.
const OUT_STATUSES = new Set(["SOLD", "TERJUAL", "KELUAR", "RETURNED"]);

// Unit yang sedang transaksi berjalan — TOLAK dengan error. Fisik masih ada
// tapi sudah di-booking/pack, kirim ke QC akan merusak alur transaksi.
const BLOCKED_STATUSES = new Set(["RESERVED", "HELD", "PACKING", "PENDING"]);

async function postHandler(req: NextRequest, props: Props, user: AuthUser) {
  try {
    const { id } = await props.params;

    // Body opsional: { unit_ids?: string[] }. Dari Kelola Unit (bulk-pilih via
    // checklist) kirim daftar unit yang mau di-reset. Dari Data Barang (stok
    // = 1) body kosong = apply ke semua unit aktif model (yang isinya 1 unit).
    const body = await req.json().catch(() => ({}));
    const requestedUnitIds: string[] | null =
      Array.isArray(body?.unit_ids) && body.unit_ids.every((x: unknown) => typeof x === "string")
        ? (body.unit_ids as string[])
        : null;

    // Ambil nama laptop untuk entityLabel di activity log
    const { data: laptop, error: laptopErr } = await supabase
      .from("laptops")
      .select("id, laptop_name")
      .eq("id", id)
      .single();

    if (laptopErr || !laptop) {
      return NextResponse.json(
        { success: false, message: laptopErr?.message || "Laptop tidak ditemukan" },
        { status: 404 }
      );
    }

    // Ambil semua unit milik laptop ini
    const { data: units, error: unitsErr } = await supabase
      .from("laptop_units")
      .select("id, status")
      .eq("laptop_id", id);

    if (unitsErr) {
      return NextResponse.json({ success: false, message: unitsErr.message }, { status: 400 });
    }
    if (!units || units.length === 0) {
      return NextResponse.json(
        { success: false, message: "Laptop ini belum punya unit" },
        { status: 400 }
      );
    }

    // Scope unit yang relevan untuk operasi ini. Kalau client kirim unit_ids,
    // hanya unit yang dipilih user yang dievaluasi — unit lain di model yang
    // sama (termasuk yang mungkin RESERVED) TIDAK boleh bikin seluruh request
    // di-reject, karena user mungkin sengaja skip unit yang lagi transaksi.
    const scopedUnits = requestedUnitIds
      ? units.filter(u => requestedUnitIds.includes(u.id))
      : units;

    if (requestedUnitIds && scopedUnits.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Unit terpilih tidak ditemukan di laptop ini",
      }, { status: 400 });
    }

    // Cegah dengan error kalau ada unit TERPILIH yang sedang transaksi.
    const blocked = scopedUnits.filter(u => BLOCKED_STATUSES.has(u.status));
    if (blocked.length > 0) {
      return NextResponse.json({
        success: false,
        message: `${blocked.length} unit terpilih sedang dalam transaksi (Reserved/Held/Packing/Pending). Batalkan transaksi dulu sebelum kirim ke QC.`,
      }, { status: 400 });
    }

    // Target = unit terpilih yang masih di gudang & belum keluar.
    const targetIds = scopedUnits
      .filter(u => !OUT_STATUSES.has(u.status))
      .map(u => u.id);

    if (targetIds.length === 0) {
      return NextResponse.json({
        success: false,
        message: requestedUnitIds
          ? "Tidak ada unit terpilih yang bisa dikirim ke QC"
          : "Tidak ada unit aktif untuk dikirim ke QC",
      }, { status: 400 });
    }

    // Reset ke BELUM_SIAP + NEEDS_QC, bersihkan flag minus lama biar tidak
    // nyangkut. Field spek (brand/cpu/ram/storage/selling_price/dll) TIDAK
    // disentuh — jadi di QcEditModal nanti otomatis muncul sebagai default,
    // bukan kosong.
    const { error: updateErr } = await supabase
      .from("laptop_units")
      .update({
        status: "BELUM_SIAP",
        qc_status: "NEEDS_QC",
        minus_status: null,
        analisa: null,
      })
      .in("id", targetIds);

    if (updateErr) {
      return NextResponse.json({ success: false, message: updateErr.message }, { status: 400 });
    }

    // Audit trail — pakai helper yang sama dengan tombol Audit/SO.
    // ⚠️ TODO: tambah "PERLU_QC" ke union LogAction di @/lib/activityLogger.ts
    // biar cast "as any" ini bisa dihapus. Sementara cast dulu biar build jalan.
    await logActivity({
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: "PERLU_QC" as any,
      entity: "laptop",
      entityId: id,
      entityLabel: laptop.laptop_name,
    });

    // Recalc qty parent — semua unit yang tadi SIAP_JUAL turun jadi BELUM_SIAP,
    // jadi laptops.qty harus di-update biar halaman Siap Jual langsung konsisten.
    await recalcLaptopParentQty(supabase, id);

    return NextResponse.json({
      success: true,
      data: { count: targetIds.length },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(postHandler, BARANG_FULL_ACCESS_ROLES);