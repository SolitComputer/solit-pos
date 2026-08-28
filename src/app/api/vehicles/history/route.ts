import { NextRequest, NextResponse } from "next/server";
import {
  supabaseVehicles,
  getRequester,
  enrichRequests,
  type BorrowRequestRow,
} from "@/lib/vehicles";

// GET /api/vehicles/history  — semua peminjaman COMPLETED (histori), terbaru dulu.
// Semua user boleh lihat.  ?mine=1 -> hanya milik user yang login.
export async function GET(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const mine = new URL(request.url).searchParams.get("mine") === "1";

  let q = supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("*")
    .eq("status", "COMPLETED")
    .order("actual_end", { ascending: false })
    .limit(300);

  if (mine) q = q.eq("user_id", me.id);

  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  const requests = await enrichRequests((data ?? []) as BorrowRequestRow[]);
  return NextResponse.json({ success: true, requests });
}
