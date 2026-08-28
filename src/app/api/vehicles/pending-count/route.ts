import { NextRequest, NextResponse } from "next/server";
import { supabaseVehicles, getRequester } from "@/lib/vehicles";

// GET /api/vehicles/pending-count — jumlah pengajuan PENDING (buat badge notif admin).
// Ringan: pakai head+count, tidak menarik row. ADMIN only.
export async function GET(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ success: true, count: 0 });

  const { count, error } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, count: count ?? 0 });
}
