import { NextRequest, NextResponse } from "next/server";
import {
  supabaseVehicles,
  getRequester,
  enrichRequests,
  type BorrowRequestRow,
} from "@/lib/vehicles";

// GET /api/vehicles/borrow
//   ?queue=1  -> antrian PENDING semua user (ADMIN only, buat halaman approval)
//   default   -> pengajuan milik user yang login (semua status, terbaru dulu)
export async function GET(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const isQueue = new URL(request.url).searchParams.get("queue") === "1";

  if (isQueue) {
    if (!me.canApprove)
      return NextResponse.json({ success: false, message: "Kamu tidak punya akses untuk melihat antrian ACC." }, { status: 403 });

    const { data, error } = await supabaseVehicles
      .from("vehicle_borrow_requests")
      .select("*")
      .eq("status", "PENDING")
      .order("requested_at", { ascending: true });

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    const requests = await enrichRequests((data ?? []) as BorrowRequestRow[]);
    return NextResponse.json({ success: true, requests });
  }

  const { data, error } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("*")
    .eq("user_id", me.id)
    .order("requested_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  const requests = await enrichRequests((data ?? []) as BorrowRequestRow[]);
  return NextResponse.json({ success: true, requests });
}

// POST /api/vehicles/borrow  — ajukan peminjaman (semua user). Hanya kalau kendaraan TERSEDIA.
export async function POST(request: NextRequest) {
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const vehicleId = body?.vehicle_id;
  if (!vehicleId) return NextResponse.json({ success: false, message: "vehicle_id wajib diisi." }, { status: 400 });

  const { data: vehicle, error: vErr } = await supabaseVehicles
    .from("vehicles")
    .select("id, status")
    .eq("id", vehicleId)
    .single();

  if (vErr || !vehicle)
    return NextResponse.json({ success: false, message: "Kendaraan tidak ditemukan." }, { status: 404 });
  if (vehicle.status !== "TERSEDIA")
    return NextResponse.json(
      { success: false, message: "Kendaraan sedang tidak tersedia (dipakai / maintenance)." },
      { status: 400 }
    );

  // Cegah user mengajukan dobel untuk kendaraan yang sama saat masih ada pengajuan aktif
  const { data: dup } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .eq("user_id", me.id)
    .in("status", ["PENDING", "APPROVED"])
    .limit(1);

  if (dup && dup.length > 0)
    return NextResponse.json(
      { success: false, message: "Kamu sudah punya pengajuan aktif untuk kendaraan ini." },
      { status: 400 }
    );

  const { data, error } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .insert({ vehicle_id: vehicleId, user_id: me.id, status: "PENDING" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
