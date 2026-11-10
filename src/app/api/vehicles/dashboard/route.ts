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

  // ── AUTO-EXPIRE: tutup paksa peminjaman yang nyangkut (lupa check-out) ──────
  // Request APPROVED yang actual_start-nya > 12 jam lalu dianggap "lupa check-out".
  // duration_minutes = NULL -> sengaja TIDAK masuk leaderboard (data tidak valid).
  // Vehicle-nya dilepas ke TERSEDIA. Jalan tiap dashboard di-load (auto-refresh 30s).
  const STALE_HOURS = 12;
  const staleCutoffIso = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  // FIX bug peminjam hilang — `.lt("actual_start", …)` di postgres bakal skip
  // row dengan actual_start=NULL. Kalau bug di approve bikin actual_start null,
  // request-nya nyangkut selamanya. Pakai .or() supaya NULL ikut masuk auto-expire,
  // dan gunakan approved_at sebagai fallback kalau actual_start null.
  const { data: staleReqs } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .update({ status: "COMPLETED", actual_end: new Date().toISOString(), duration_minutes: null })
    .eq("status", "APPROVED")
    .or(`actual_start.lt.${staleCutoffIso},and(actual_start.is.null,approved_at.lt.${staleCutoffIso})`)
    .select("vehicle_id");

  if (staleReqs && staleReqs.length > 0) {
    const staleVehicleIds = [...new Set(staleReqs.map((r) => r.vehicle_id))];
    // Hanya lepas kendaraan yang DIPAKAI (jangan sentuh yang MAINTENANCE/manual).
    await supabaseVehicles
      .from("vehicles")
      .update({ status: "TERSEDIA", updated_at: new Date().toISOString() })
      .in("id", staleVehicleIds)
      .eq("status", "DIPAKAI");
  }

  // 2) Sedang berjalan (APPROVED) + Menunggu ACC (PENDING)
  const { data: activeRaw, error: aErr } = await supabaseVehicles
    .from("vehicle_borrow_requests")
    .select("*")
    .in("status", ["APPROVED", "PENDING"])
    .order("requested_at", { ascending: true });
  if (aErr) return NextResponse.json({ success: false, message: aErr.message }, { status: 500 });

  const enrichedActive = await enrichRequests((activeRaw ?? []) as BorrowRequestRow[]);
  let running = enrichedActive.filter((r) => r.status === "APPROVED");
  const pending = enrichedActive.filter((r) => r.status === "PENDING");

  // FIX bug "Sedang Dipakai: 3 tapi Sedang Berjalan: 2" — kalau enrichRequests
  // ngedrop baris (JOIN user gagal, atau actual_start=null bikin baris diabaikan
  // downstream), jumlahnya mismatch. Kita bandingin daftar vehicle_id yang DIPAKAI
  // vs running.vehicle_id, lalu tarik ulang request yang hilang langsung dari DB
  // tanpa lewat enrichRequests (biar gak ke-drop lagi).
  const dipakaiVehicleIds = (vehicles ?? [])
    .filter((v) => v.status === "DIPAKAI")
    .map((v) => v.id);
  const runningVehicleIds = new Set(running.map((r) => r.vehicle_id));
  const missingVehicleIds = dipakaiVehicleIds.filter((id) => !runningVehicleIds.has(id));

  if (missingVehicleIds.length > 0) {
    const { data: missingRaw } = await supabaseVehicles
      .from("vehicle_borrow_requests")
      .select("*")
      .eq("status", "APPROVED")
      .in("vehicle_id", missingVehicleIds)
      .order("requested_at", { ascending: false });

    if (missingRaw && missingRaw.length > 0) {
      // Ambil hanya 1 request terbaru per vehicle.
      const seen = new Set<string>();
      const dedup = missingRaw.filter((r: any) => {
        if (seen.has(r.vehicle_id)) return false;
        seen.add(r.vehicle_id);
        return true;
      });

      // Lookup nama borrower + vehicle secara manual (hindari enrichRequests yang
      // mungkin drop baris). Server-side fallback — tetap robust walau JOIN gagal.
      const uids = [...new Set(dedup.map((r: any) => r.user_id).filter(Boolean))];
      const vids = [...new Set(dedup.map((r: any) => r.vehicle_id).filter(Boolean))];
      const [uRes, vRes] = await Promise.all([
        uids.length
          ? supabaseVehicles.from("users").select("id, name, role").in("id", uids)
          : Promise.resolve({ data: [] as any[] }),
        vids.length
          ? supabaseVehicles.from("vehicles").select("id, name").in("id", vids)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const uMap: Record<string, { id: string; name: string; role: string }> = {};
      (uRes.data ?? []).forEach((u: any) => (uMap[u.id] = { id: u.id, name: u.name, role: u.role }));
      const vMap: Record<string, { id: string; name: string }> = {};
      (vRes.data ?? []).forEach((v: any) => (vMap[v.id] = { id: v.id, name: v.name }));

      const patched = dedup.map((r: any) => ({
        ...r,
        borrower: uMap[r.user_id] ?? { id: r.user_id, name: "—", role: "" },
        vehicle: vMap[r.vehicle_id] ?? { id: r.vehicle_id, name: "—" },
      }));

      running = [...running, ...(patched as any[])];
      console.warn(
        "[vehicles/dashboard] Running list tambahan lewat fallback untuk vehicle:",
        missingVehicleIds
      );
    }
  }

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
    currentUserId: me.id, // FIX — biar frontend bisa cross-check
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
