import { NextRequest, NextResponse } from "next/server";
import {
  supabaseVehicles,
  getRequester,
  enrichRequests,
  type BorrowRequestRow,
} from "@/lib/vehicles";

// GET /api/vehicles
// Semua user (termasuk PKL) boleh lihat daftar kendaraan + pengajuan miliknya sendiri.
export async function GET(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { data: vehicles, error: vErr } = await supabaseVehicles
    .from("vehicles")
    .select("id, name, type, status, battery_level, fuel_level")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (vErr) return NextResponse.json({ success: false, message: vErr.message }, { status: 500 });

  // Pemakaian terakhir per kendaraan (buat "dipinjam siapa" + status pemakaian terakhir)
  const vehicleIds = (vehicles ?? []).map((v) => v.id);
  const lastUsageMap: Record<
    string,
    { borrower_name: string; status: string; fuel: string | null; condition: string | null; at: string | null }
  > = {};
  if (vehicleIds.length) {
    const { data: usageRows } = await supabaseVehicles
      .from("vehicle_borrow_requests")
      .select("vehicle_id, user_id, status, return_fuel_level, return_condition, actual_start, actual_end, requested_at")
      .in("vehicle_id", vehicleIds)
      .in("status", ["APPROVED", "COMPLETED"])
      .order("requested_at", { ascending: false });

    const uids = [...new Set((usageRows ?? []).map((r) => r.user_id).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (uids.length) {
      const { data: us } = await supabaseVehicles.from("users").select("id, name").in("id", uids);
      (us ?? []).forEach((u: any) => (nameMap[u.id] = u.name));
    }
    for (const r of usageRows ?? []) {
      if (lastUsageMap[r.vehicle_id]) continue; // sudah ambil yang terbaru (order desc)
      lastUsageMap[r.vehicle_id] = {
        borrower_name: nameMap[r.user_id] ?? "—",
        status: r.status,
        fuel: r.return_fuel_level ?? null,
        condition: r.return_condition ?? null,
        at: r.actual_end ?? r.actual_start ?? r.requested_at ?? null,
      };
    }
  }
  const vehiclesOut = (vehicles ?? []).map((v) => ({ ...v, lastUsage: lastUsageMap[v.id] ?? null }));

  // Pengajuan milik user: aktif (PENDING/APPROVED) + yang baru ditolak (7 hari terakhir),
  // supaya peminjam dapat notifikasi kalau pengajuannya ditolak.
  const rejectedSince = new Date(Date.now() - 7 * 86400000).toISOString();
  const [activeRes, rejectedRes] = await Promise.all([
    supabaseVehicles
      .from("vehicle_borrow_requests")
      .select("*")
      .eq("user_id", me.id)
      .in("status", ["PENDING", "APPROVED"])
      .order("requested_at", { ascending: false }),
    supabaseVehicles
      .from("vehicle_borrow_requests")
      .select("*")
      .eq("user_id", me.id)
      .eq("status", "REJECTED")
      .gte("approved_at", rejectedSince)
      .order("approved_at", { ascending: false }),
  ]);

  if (activeRes.error) return NextResponse.json({ success: false, message: activeRes.error.message }, { status: 500 });

  const mineRaw = [...(activeRes.data ?? []), ...(rejectedRes.data ?? [])];
  const myRequests = await enrichRequests(mineRaw as BorrowRequestRow[]);

  return NextResponse.json({
    success: true,
    vehicles: vehiclesOut,
    myRequests,
    isAdmin: me.isAdmin,
  });
}

// POST /api/vehicles  — tambah kendaraan (ADMIN only)
export async function POST(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!me.isAdmin)
    return NextResponse.json(
      { success: false, message: "Hanya Admin yang bisa menambah kendaraan." },
      { status: 403 }
    );

  const body = await request.json().catch(() => null);
  const name = (body?.name ?? "").trim();
  const type = body?.type;
  const fuel_level = body?.fuel_level?.trim() || null;

  if (!name) return NextResponse.json({ success: false, message: "Nama kendaraan wajib diisi." }, { status: 400 });
  if (type !== "MOTOR" && type !== "MOBIL")
    return NextResponse.json({ success: false, message: "Tipe harus MOTOR atau MOBIL." }, { status: 400 });

  const { data, error } = await supabaseVehicles
    .from("vehicles")
    .insert({
      name,
      type,
      status: "TERSEDIA",
      // fuel_level = level bensin/baterai awal (mobil & motor)
      fuel_level,
    })
    .select("id, name, type, status, battery_level, fuel_level")
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
