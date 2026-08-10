import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser } from "@/lib/auth";
import { MONITORING_STOCK_ROLES } from "@/lib/permissions";
import { logActivity } from "@/lib/activityLogger";
import { fetchAllRows } from "@/lib/supabaseFetch";

// ── POST: Auto-fix / Reconcile Stok ─────────────────────────────────────────
// Recalculate setiap laptops.qty agar sesuai dgn jumlah laptop_units berstatus
// SIAP_JUAL. Kalau setelah recalculate qty > 0, status parent juga di-set
// SIAP_JUAL (mengembalikan laptop yang sempat SOLD). Mengembalikan daftar
// perubahan stok yang dilakukan.

interface FixLog {
  laptop_id: string;
  laptop_name: string;
  old_qty: number;
  new_qty: number;
  old_status: string;
  new_status: string;
}

interface UnitStatusRow {
  id: string;
  laptop_id: string;
  status: string;
}

interface LaptopQtyRow {
  id: string;
  laptop_name: string;
  qty: number;
  status: string;
}

async function handler(req: NextRequest, ctx: unknown, user: AuthUser) {
  try {
    // 1) Ambil semua unit + parent laptop
    const allUnits = await fetchAllRows<UnitStatusRow>((from, to) =>
      supabase
        .from("laptop_units")
        .select("id, laptop_id, status")
        .range(from, to)
    );

    const allLaptops = await fetchAllRows<LaptopQtyRow>((from, to) =>
      supabase
        .from("laptops")
        .select("id, laptop_name, qty, status")
        .range(from, to)
    );

    // 2) Hitung qty aktual per laptop_id
    const actualQty = new Map<string, number>();
    for (const u of allUnits) {
      if (u.status === "SIAP_JUAL") {
        actualQty.set(u.laptop_id, (actualQty.get(u.laptop_id) ?? 0) + 1);
      }
    }

    // 3) Bandingkan & patch yang berbeda
    const fixes: FixLog[] = [];
    for (const laptop of allLaptops) {
      const real = actualQty.get(laptop.id) ?? 0;
      const recorded = laptop.qty ?? 0;

      // Tentukan status baru — sama logikanya dgn recalcLaptopParentQty()
      let newStatus = laptop.status;
      if (real > 0) {
        newStatus = "SIAP_JUAL";
      }
      // Kalau qty 0 tapi status sebelumnya SIAP_JUAL → ubah ke SOLD
      // (tidak punya unit aktif lagi). Status lain (BELUM_SIAP) jangan diubah.
      if (real === 0 && laptop.status === "SIAP_JUAL") {
        newStatus = "SOLD";
      }

      if (recorded !== real || laptop.status !== newStatus) {
        const { error } = await supabase
          .from("laptops")
          .update({ qty: real, status: newStatus, ready_to_sell: real > 0 })
          .eq("id", laptop.id);

        if (!error) {
          fixes.push({
            laptop_id: laptop.id,
            laptop_name: laptop.laptop_name,
            old_qty: recorded,
            new_qty: real,
            old_status: laptop.status,
            new_status: newStatus,
          });
        }
      }
    }

    // 4) Log aktivitas
    if (fixes.length > 0) {
      await logActivity({
        userId: user.id,
        userName: user.name ?? "Unknown",
        userRole: user.role,
        action: "EDIT",
        entity: "laptop",
        entityLabel: `Sinkronisasi stok (${fixes.length} laptop)`,
        beforeData: { fixes: fixes.map(f => ({ laptop_id: f.laptop_id, qty: f.old_qty, status: f.old_status })) },
        afterData: { fixes: fixes.map(f => ({ laptop_id: f.laptop_id, qty: f.new_qty, status: f.new_status })) },
      });
    }

    return NextResponse.json({
      success: true,
      fixed: fixes.length,
      data: fixes,
    });
  } catch (err) {
    console.error("[reconcile]", err);
    return NextResponse.json(
      { success: false, message: "Gagal rekonsiliasi stok" },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler, MONITORING_STOCK_ROLES);
