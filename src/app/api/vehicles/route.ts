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
    .select("id, name, type, status, battery_level, fuel_level, plate_number")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (vErr) return NextResponse.json({ success: false, message: vErr.message }, { status: 500 });

  // Pemakaian terakhir per kendaraan (buat "dipinjam siapa" + status pemakaian terakhir + siapa yang ACC)
  const vehicleIds = (vehicles ?? []).map((v) => v.id);
  const lastUsageMap: Record<
    string,
    {
      request_id: string;
      borrower_id: string;
      borrower_name: string;
      approver_id: string | null;
      approver_name: string | null;
      status: string;
      fuel: string | null;
      condition: string | null;
      at: string | null;
    }
  > = {};
  if (vehicleIds.length) {
    const { data: usageRows } = await supabaseVehicles
      .from("vehicle_borrow_requests")
         .select("id, vehicle_id, user_id, status, return_fuel_level, return_condition, actual_start, actual_end, requested_at, approved_by, duration_minutes")
      .in("vehicle_id", vehicleIds)
      .in("status", ["APPROVED", "COMPLETED"])
      .order("requested_at", { ascending: false });

    // Kumpulkan id peminjam DAN id approver, sekali query ke tabel users
    const uids = [
      ...new Set(
        (usageRows ?? [])
          .flatMap((r) => [r.user_id, r.approved_by])
          .filter(Boolean)
      ),
    ];
    const nameMap: Record<string, string> = {};
    if (uids.length) {
      const { data: us } = await supabaseVehicles.from("users").select("id, name").in("id", uids);
      (us ?? []).forEach((u: any) => (nameMap[u.id] = u.name));
    }
    // Map status vehicle per id — dipakai buat deteksi "stuck state":
    // vehicle masih DIPAKAI padahal request-nya udah ter-auto-expire ke COMPLETED
    // (karena di /api/vehicles/dashboard auto-expire sukses update request tapi
    // GAGAL update vehicle → non-transaksional, data jadi yatim).
    const vehicleStatusMap: Record<string, string> = {};
    (vehicles ?? []).forEach((v) => (vehicleStatusMap[v.id] = v.status));

    // Pass 1: prioritaskan request APPROVED (= yang beneran masih aktif dipakai).
    for (const r of usageRows ?? []) {
      if (r.status !== "APPROVED") continue;
      if (lastUsageMap[r.vehicle_id]) continue;
      lastUsageMap[r.vehicle_id] = {
        request_id: r.id,
        borrower_id: r.user_id,
        borrower_name: nameMap[r.user_id] ?? "—",
        approver_id: r.approved_by ?? null,
        approver_name: r.approved_by ? (nameMap[r.approved_by] ?? "—") : null,
        status: r.status,
        fuel: r.return_fuel_level ?? null,
        condition: r.return_condition ?? null,
        at: r.actual_end ?? r.actual_start ?? r.requested_at ?? null,
      };
    }

    // Pass 2: sisanya pakai COMPLETED terbaru.
    // FIX stuck state: kalau request COMPLETED + duration_minutes=null + vehicle
    // masih DIPAKAI → relabel status jadi "APPROVED" supaya UI tetap kasih
    // tombol Check-out ke peminjam asli (mis. Raesty).
    for (const r of usageRows ?? []) {
      if (r.status !== "COMPLETED") continue;
      if (lastUsageMap[r.vehicle_id]) continue;
      const isStuckAutoExpired =
        r.duration_minutes === null && vehicleStatusMap[r.vehicle_id] === "DIPAKAI";
      lastUsageMap[r.vehicle_id] = {
        // FIX bug "Sedang dipakai karyawan lain" — frontend butuh id-nya untuk
        // fallback deteksi "saya peminjam-nya" kalau myRequests query missing.
        request_id: r.id,
        borrower_id: r.user_id,
        borrower_name: nameMap[r.user_id] ?? "—",
        approver_id: r.approved_by ?? null,
        approver_name: r.approved_by ? (nameMap[r.approved_by] ?? "—") : null,
        status: isStuckAutoExpired ? "APPROVED" : r.status,
        fuel: r.return_fuel_level ?? null,
        condition: r.return_condition ?? null,
        at: r.actual_end ?? r.actual_start ?? r.requested_at ?? null,
      };
      if (isStuckAutoExpired && process.env.NODE_ENV !== "production") {
        console.warn(
          "[vehicles] STUCK STATE — request auto-expired tapi vehicle masih DIPAKAI:",
          { vehicle_id: r.vehicle_id, request_id: r.id, borrower_id: r.user_id }
        );
      }
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

  // FIX bug Raesty gabisa checkout — safety net:
  // Kalau ada vehicle DIPAKAI dengan borrower_id === me.id di lastUsage TAPI
  // request-nya tidak ketangkap di activeRes (misalnya karena id format mismatch,
  // atau enrichRequests ngedrop, atau kolom user_id nyimpen value beda), tarik
  // ulang langsung by lastUsage.request_id. Peminjam asli PASTI bisa checkout.
  const activeIds = new Set((activeRes.data ?? []).map((r: any) => r.id));
  const missingRequestIds: string[] = [];
  for (const v of vehiclesOut) {
    if (
      v.status === "DIPAKAI" &&
      v.lastUsage?.status === "APPROVED" &&
      v.lastUsage?.borrower_id === me.id &&
      v.lastUsage?.request_id &&
      !activeIds.has(v.lastUsage.request_id)
    ) {
      missingRequestIds.push(v.lastUsage.request_id);
    }
  }

  let patchedActive: any[] = [];
  if (missingRequestIds.length > 0) {
    const { data: patchRows } = await supabaseVehicles
      .from("vehicle_borrow_requests")
      .select("*")
      .in("id", missingRequestIds);
    if (patchRows && patchRows.length > 0) {
      // FIX stuck state: normalisasi COMPLETED (duration_minutes=null) ke "APPROVED"
      // di myRequests juga — supaya myActiveFor() di frontend ngematch, dan
      // peminjam asli (Raesty) langsung lihat tombol Check-out dengan request asli
      // (bukan stub fallback dari lastUsage).
      patchedActive = patchRows.map((r: any) =>
        r.status === "COMPLETED" && r.duration_minutes === null
          ? { ...r, status: "APPROVED" }
          : r
      );
      console.warn(
        "[vehicles] myRequests patched via lastUsage fallback — periksa konsistensi user_id. me.id:",
        me.id,
        "patched_ids:",
        missingRequestIds
      );
    }
  }

  const mineRaw = [...(activeRes.data ?? []), ...patchedActive, ...(rejectedRes.data ?? [])];
  const myRequests = await enrichRequests(mineRaw as BorrowRequestRow[]);

  return NextResponse.json({
    success: true,
    currentUserId: me.id, // FIX — dipakai frontend untuk cross-check peminjam aktif
    vehicles: vehiclesOut,
    myRequests,
    isAdmin: me.isAdmin,
    canApprove: me.canApprove,
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
  const plate_number = body?.plate_number?.trim() || null;
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
      plate_number,
      // fuel_level = level bensin/baterai awal (mobil & motor)
      fuel_level,
    })
    .select("id, name, type, status, battery_level, fuel_level, plate_number")
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}