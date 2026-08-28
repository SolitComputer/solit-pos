import { NextRequest, NextResponse } from "next/server";
import { supabaseVehicles, getRequester } from "@/lib/vehicles";

// PUT /api/vehicles/[id]  — edit kendaraan / ubah status (mis. jadi/dari MAINTENANCE). ADMIN only.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!me.isAdmin)
    return NextResponse.json({ success: false, message: "Hanya Admin yang bisa mengubah kendaraan." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, message: "Body tidak valid." }, { status: 400 });

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ success: false, message: "Nama kendaraan wajib diisi." }, { status: 400 });
    patch.name = name;
  }
  if (body.type !== undefined) {
    if (body.type !== "MOTOR" && body.type !== "MOBIL")
      return NextResponse.json({ success: false, message: "Tipe harus MOTOR atau MOBIL." }, { status: 400 });
    patch.type = body.type;
  }
  if (body.status !== undefined) {
    if (!["TERSEDIA", "DIPAKAI", "MAINTENANCE"].includes(body.status))
      return NextResponse.json({ success: false, message: "Status tidak valid." }, { status: 400 });
    patch.status = body.status;
  }
  if (body.battery_level !== undefined) {
    patch.battery_level = body.battery_level?.trim() || null;
  }

  const { data, error } = await supabaseVehicles
    .from("vehicles")
    .update(patch)
    .eq("id", id)
    .select("id, name, type, status, battery_level")
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, message: "Kendaraan tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

// DELETE /api/vehicles/[id]  — hapus kendaraan. ADMIN only.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!me.isAdmin)
    return NextResponse.json({ success: false, message: "Hanya Admin yang bisa menghapus kendaraan." }, { status: 403 });

  // Cegah hapus kendaraan yang lagi dipakai / punya pengajuan aktif
  const { data: active } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("id")
    .eq("vehicle_id", id)
    .in("status", ["PENDING", "APPROVED"])
    .limit(1);

  if (active && active.length > 0)
    return NextResponse.json(
      { success: false, message: "Kendaraan masih punya pengajuan aktif (pending/dipakai). Selesaikan dulu." },
      { status: 400 }
    );

  const { error } = await supabaseVehicles.from("vehicles").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
