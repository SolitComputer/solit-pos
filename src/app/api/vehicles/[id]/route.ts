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

  // GUARD: kendaraan yang SEDANG DIPAKAI tidak boleh diubah detailnya lewat route ini.
  // Satu-satunya PUT yang diizinkan saat DIPAKAI adalah "paksa bebaskan": ubah status
  // saja ke TERSEDIA/MAINTENANCE (mis. peminjam lupa check-out) — ini menjaga mekanisme
  // self-healing yang sudah ada di bawah tetap hidup. Edit nama/plat/tipe/bensin ditolak.
  const { data: current, error: curErr } = await supabaseVehicles
    .from("vehicles")
    .select("status")
    .eq("id", id)
    .single();

  if (curErr || !current)
    return NextResponse.json({ success: false, message: "Kendaraan tidak ditemukan." }, { status: 404 });

  if (current.status === "DIPAKAI") {
    const hanyaMembebaskan =
      (body.status === "TERSEDIA" || body.status === "MAINTENANCE") &&
      body.name === undefined &&
      body.type === undefined &&
      body.plate_number === undefined &&
      body.fuel_level === undefined &&
      body.battery_level === undefined;

    if (!hanyaMembebaskan)
      return NextResponse.json(
        {
          success: false,
          message: "Kendaraan sedang dipakai. Tunggu peminjam check-out, atau ubah statusnya saja untuk membebaskan.",
        },
        { status: 409 }
      );
  }

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
  if (body.fuel_level !== undefined) {
    patch.fuel_level = body.fuel_level?.trim() || null;
  }
  if (body.plate_number !== undefined) {
    patch.plate_number = body.plate_number?.trim() || null;
  }

  const { data, error } = await supabaseVehicles
    .from("vehicles")
    .update(patch)
    .eq("id", id)
    .select("id, name, type, status, battery_level, fuel_level, plate_number")
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, message: "Kendaraan tidak ditemukan." }, { status: 404 });

  // Sinkronkan pengajuan saat Admin ubah status manual lewat modal Edit.
  // Blok ini SELF-GUARDING: request APPROVED/PENDING hanya ada saat data tidak
  // sinkron, jadi edit biasa (ganti nama/plat) pada kendaraan TERSEDIA normal
  // TIDAK terdampak — tidak ada request aktif yang ke-match.
  if (patch.status === "TERSEDIA" || patch.status === "MAINTENANCE") {
    // Kendaraan dinyatakan bebas/diservis -> paksa tutup pemakaian yang masih APPROVED
    // biar tidak jadi data hantu yang mengunci kendaraan saat diajukan lagi.
    await supabaseVehicles
      .from("vehicle_borrow_requests")
      .update({ status: "COMPLETED", actual_end: patch.updated_at })
      .eq("vehicle_id", id)
      .eq("status", "APPROVED");
  }
  if (patch.status === "MAINTENANCE") {
    // Masuk maintenance -> pengajuan PENDING tidak mungkin di-ACC (ACC butuh TERSEDIA),
    // jadi batalkan biar tidak nyangkut.
    await supabaseVehicles
      .from("vehicle_borrow_requests")
      .update({ status: "REJECTED", rejection_note: "Dibatalkan otomatis: kendaraan masuk maintenance oleh admin." })
      .eq("vehicle_id", id)
      .eq("status", "PENDING");
  }

  return NextResponse.json({ success: true, data });
}

// DELETE /api/vehicles/[id]  — hapus kendaraan. ADMIN only.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  if (!me.isAdmin)
    return NextResponse.json({ success: false, message: "Hanya Admin yang bisa menghapus kendaraan." }, { status: 403 });

  // Cegah hapus kendaraan yang SEDANG DIPAKAI (ada peminjaman APPROVED aktif).
  // Pengajuan PENDING TIDAK memblokir hapus — sesuai aturan (tombol Hapus tetap
  // tersedia saat pending), tapi pending-nya ditolak dulu di bawah biar tidak
  // jadi data yatim yang menunjuk ke kendaraan yang sudah tiada.
  const { data: inUse } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("id")
    .eq("vehicle_id", id)
    .eq("status", "APPROVED")
    .limit(1);

  if (inUse && inUse.length > 0)
    return NextResponse.json(
      { success: false, message: "Kendaraan sedang dipakai. Tunggu peminjam check-out dulu sebelum dihapus." },
      { status: 409 }
    );

  // Tolak pengajuan PENDING yang menempel ke kendaraan ini sebelum dihapus.
  await supabaseVehicles
    .from("vehicle_borrow_requests")
    .update({ status: "REJECTED", rejection_note: "Dibatalkan otomatis: kendaraan dihapus oleh admin." })
    .eq("vehicle_id", id)
    .eq("status", "PENDING");

  const { error } = await supabaseVehicles.from("vehicles").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}