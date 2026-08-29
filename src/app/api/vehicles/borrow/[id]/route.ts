import { NextRequest, NextResponse } from "next/server";
import { supabaseVehicles, getRequester } from "@/lib/vehicles";

// PATCH /api/vehicles/borrow/[id]  — aksi terhadap satu pengajuan
//   action: "APPROVE" | "REJECT"  -> ADMIN, dan BUKAN pengaju itu sendiri
//   action: "CHECKOUT"            -> hanya peminjam yang bersangkutan
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getRequester(request);
  if (!me) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!action) return NextResponse.json({ success: false, message: "action wajib diisi." }, { status: 400 });

  const { data: req, error: rErr } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (rErr || !req)
    return NextResponse.json({ success: false, message: "Pengajuan tidak ditemukan." }, { status: 404 });

  const nowIso = new Date().toISOString();

  // ─── APPROVE ───────────────────────────────────────────────────────────────
 if (action === "APPROVE") {
    if (!me.canApprove)
      return NextResponse.json({ success: false, message: "Kamu tidak punya akses untuk meng-ACC pengajuan ini." }, { status: 403 });
    // Validasi anti self-approve: admin TIDAK boleh ACC pengajuannya sendiri
    if (me.id === req.user_id)
      return NextResponse.json(
        { success: false, message: "Kamu tidak boleh meng-ACC pengajuanmu sendiri. Minta Admin lain." },
        { status: 403 }
      );
    if (req.status !== "PENDING")
      return NextResponse.json(
        { success: false, message: `Pengajuan ini sudah berstatus ${req.status}.` },
        { status: 400 }
      );

    // Pastikan kendaraan masih TERSEDIA (bisa keburu diambil approval lain)
    const { data: vehicle } = await supabaseVehicles
      .from("vehicles")
      .select("id, status")
      .eq("id", req.vehicle_id)
      .single();
    if (!vehicle)
      return NextResponse.json({ success: false, message: "Kendaraan tidak ditemukan." }, { status: 404 });
    if (vehicle.status !== "TERSEDIA")
      return NextResponse.json(
        { success: false, message: "Kendaraan sudah tidak tersedia. Tidak bisa di-ACC." },
        { status: 400 }
      );

    const { data, error } = await supabaseVehicles
      .from("vehicle_borrow_requests")
      .update({ status: "APPROVED", approved_by: me.id, approved_at: nowIso, actual_start: nowIso })
      .eq("id", id)
      .eq("status", "PENDING") // guard optimistis
      .select("*")
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    if (!data)
      return NextResponse.json({ success: false, message: "Pengajuan sudah diproses user lain." }, { status: 409 });

    await supabaseVehicles
      .from("vehicles")
      .update({ status: "DIPAKAI", updated_at: nowIso })
      .eq("id", req.vehicle_id);

    return NextResponse.json({ success: true, data });
  }

  // ─── REJECT ──────────────────────────────────────────────────────────────
 if (action === "REJECT") {
    if (!me.canApprove)
      return NextResponse.json({ success: false, message: "Kamu tidak punya akses untuk menolak pengajuan ini." }, { status: 403 });
    if (me.id === req.user_id)
      return NextResponse.json(
        { success: false, message: "Kamu tidak boleh menolak pengajuanmu sendiri." },
        { status: 403 }
      );
    if (req.status !== "PENDING")
      return NextResponse.json(
        { success: false, message: `Pengajuan ini sudah berstatus ${req.status}.` },
        { status: 400 }
      );

    const note = (body?.rejection_note ?? "").trim();
    if (!note)
      return NextResponse.json({ success: false, message: "Alasan penolakan wajib diisi." }, { status: 400 });

    const { data, error } = await supabaseVehicles
      .from("vehicle_borrow_requests")
      .update({ status: "REJECTED", approved_by: me.id, approved_at: nowIso, rejection_note: note })
      .eq("id", id)
      .eq("status", "PENDING")
      .select("*")
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    if (!data)
      return NextResponse.json({ success: false, message: "Pengajuan sudah diproses user lain." }, { status: 409 });
    return NextResponse.json({ success: true, data });
  }

  // ─── CHECKOUT (selesai pakai) ────────────────────────────────────────────────
  if (action === "CHECKOUT") {
    if (me.id !== req.user_id)
      return NextResponse.json(
        { success: false, message: "Hanya peminjam yang bisa melakukan check-out kendaraan ini." },
        { status: 403 }
      );
    if (req.status !== "APPROVED")
      return NextResponse.json(
        { success: false, message: "Pengajuan ini tidak sedang dipakai." },
        { status: 400 }
      );

    const fuel = (body?.return_fuel_level ?? "").trim();
    const condition = body?.return_condition;
    if (!fuel)
      return NextResponse.json({ success: false, message: "Level bensin/baterai wajib diisi." }, { status: 400 });
    if (!["BAIK", "LECET", "RUSAK"].includes(condition))
      return NextResponse.json({ success: false, message: "Kondisi harus Baik / Lecet / Rusak." }, { status: 400 });

    // Hitung durasi otomatis: actual_end - actual_start (menit)
    const start = req.actual_start ? new Date(req.actual_start).getTime() : Date.now();
    const durationMinutes = Math.max(0, Math.round((Date.now() - start) / 60000));

    const { data, error } = await supabaseVehicles
      .from("vehicle_borrow_requests")
      .update({
        status: "COMPLETED",
        actual_end: nowIso,
        return_fuel_level: fuel,
        return_condition: condition,
        duration_minutes: durationMinutes,
      })
      .eq("id", id)
      .eq("status", "APPROVED")
      .select("*")
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    if (!data)
      return NextResponse.json({ success: false, message: "Pengajuan sudah di-checkout." }, { status: 409 });

    // RUSAK -> kunci MAINTENANCE sampai admin kembalikan manual. Selain itu -> TERSEDIA.
    // fuel_level kendaraan di-update ke level bensin/baterai hasil checkout terakhir.
    const nextVehicleStatus = condition === "RUSAK" ? "MAINTENANCE" : "TERSEDIA";
    await supabaseVehicles
      .from("vehicles")
      .update({ status: nextVehicleStatus, fuel_level: fuel, updated_at: nowIso })
      .eq("id", req.vehicle_id);

    return NextResponse.json({ success: true, data, vehicleStatus: nextVehicleStatus });
  }

  return NextResponse.json({ success: false, message: "action tidak dikenal." }, { status: 400 });
}
