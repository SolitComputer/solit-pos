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
    .select("id, name, type, status, battery_level")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (vErr) return NextResponse.json({ success: false, message: vErr.message }, { status: 500 });

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
    vehicles: vehicles ?? [],
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
  const battery_level = body?.battery_level?.trim() || null;

  if (!name) return NextResponse.json({ success: false, message: "Nama kendaraan wajib diisi." }, { status: 400 });
  if (type !== "MOTOR" && type !== "MOBIL")
    return NextResponse.json({ success: false, message: "Tipe harus MOTOR atau MOBIL." }, { status: 400 });

  const { data, error } = await supabaseVehicles
    .from("vehicles")
    .insert({
      name,
      type,
      status: "TERSEDIA",
      // battery_level cuma disimpan buat motor
      battery_level: type === "MOTOR" ? battery_level : null,
    })
    .select("id, name, type, status, battery_level")
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
