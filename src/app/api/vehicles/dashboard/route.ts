import { NextRequest, NextResponse } from "next/server";
import {
  supabaseVehicles,
  getRequester,
  enrichRequests,
  type BorrowRequestRow,
} from "@/lib/vehicles";
import { fetchAllRows } from "@/lib/supabaseFetch";

// GET /api/vehicles/dashboard — data monitoring kendaraan (semua user boleh lihat)
export async function GET(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  // 1) Semua kendaraan buat metric card
  const { data: vehicles, error: vErr } = await supabaseVehicles
    .from("vehicles")
    .select("id, name, type, status, battery_level, fuel_level");
  if (vErr) return NextResponse.json({ success: false, message: vErr.message }, { status: 500 });

  const totalVehicles = vehicles?.length ?? 0;
  const inUse = (vehicles ?? []).filter((v) => v.status === "DIPAKAI").length;
  const maintenance = (vehicles ?? []).filter((v) => v.status === "MAINTENANCE").length;

  // 2) Sedang berjalan (APPROVED) + Menunggu ACC (PENDING)
  const { data: activeRaw, error: aErr } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("*")
    .in("status", ["APPROVED", "PENDING"])
    .order("requested_at", { ascending: true });
  if (aErr) return NextResponse.json({ success: false, message: aErr.message }, { status: 500 });

  const enrichedActive = await enrichRequests((activeRaw ?? []) as BorrowRequestRow[]);
  const running = enrichedActive.filter((r) => r.status === "APPROVED");
  const pending = enrichedActive.filter((r) => r.status === "PENDING");

  // 3) Leaderboard: total menit pemakaian per user (semua COMPLETED, di-page biar aman dari cap 1000)
  const completed = await fetchAllRows<{ user_id: string; duration_minutes: number | null }>((f, t) =>
    supabaseVehicles
      .from("vehicle_borrow_requests")
      .select("user_id, duration_minutes")
      .eq("status", "COMPLETED")
      .range(f, t)
  );

  const totalsMap: Record<string, number> = {};
  for (const row of completed) {
    if (!row.user_id) continue;
    totalsMap[row.user_id] = (totalsMap[row.user_id] ?? 0) + (row.duration_minutes ?? 0);
  }

  const leaderUserIds = Object.keys(totalsMap);
  let leaderboard: { user_id: string; name: string; total_minutes: number }[] = [];
  if (leaderUserIds.length) {
    const { data: users } = await supabaseVehicles
      .from("users")
      .select("id, name")
      .in("id", leaderUserIds);
    const nameMap: Record<string, string> = {};
    (users ?? []).forEach((u: any) => (nameMap[u.id] = u.name));
    leaderboard = leaderUserIds
      .map((uid) => ({ user_id: uid, name: nameMap[uid] ?? "—", total_minutes: totalsMap[uid] }))
      .sort((a, b) => b.total_minutes - a.total_minutes);
  }

  return NextResponse.json({
    success: true,
    isAdmin: me.isAdmin,
    metrics: {
      totalVehicles,
      inUse,
      pending: pending.length,
      maintenance,
    },
    running,
    pending,
    leaderboard,
  });
}
