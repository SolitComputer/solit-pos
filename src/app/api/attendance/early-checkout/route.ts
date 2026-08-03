import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

// ⚠️ Samakan dengan DIVISION_HEAD_MAP di api/attendance/overtime/route.ts —
// kalau ubah salah satu, ubah juga yang satunya.
const DIVISION_HEAD_MAP: Record<string, string[]> = {
  KEPALA_SALES: ["CREW_SALES", "SOTECH", "PENGANTARAN", "KEPALA_SALES", "PKL_SALES", "PKL", "PKL_PENGANTARAN"],
  KEPALA_MARKETING: ["MARKETING", "KONTEN", "KEPALA_MARKETING", "PKL_MARKETING", "PKL_KONTEN", "PKL"],
  KEPALA_TEKNISI: ["TEKNISI", "PENGELOLA_BARANG", "CUSTOMER_SERVICE", "KEPALA_TEKNISI", "PKL_TEKNISI", "PKL_CUSTOMER_SERVICE", "PKL"],
  KEPALA_ONPOINT: ["ONPOINT", "KEPALA_ONPOINT", "PKL_ONPOINT", "PKL"],
  KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PENGELOLA_BARANG", "KEPALA_PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG", "PKL"],
  KEPALA_SOTECH: ["SOTECH", "KEPALA_SOTECH", "PKL_SOTECH", "PKL"],
  KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG", "TEKNISI", "CUSTOMER_SERVICE", "KEPALA_PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG", "PKL_TEKNISI", "PKL"],
};

function canApprove(approverRole: string, targetRole: string): boolean {
  if (FULL_ACCESS.includes(approverRole)) return true;
  return DIVISION_HEAD_MAP[approverRole]?.includes(targetRole) ?? false;
}
function canApproveMulti(approverRoles: string[], targetRole: string): boolean {
  return approverRoles.some(r => canApprove(r, targetRole));
}

// ── GET — daftar pengajuan izin pulang cepat (scoped by role) ──────────────
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    const isFullAccessUser = userRoles.some(r => FULL_ACCESS.includes(r));

    let q = supabase
      .from("early_checkout_requests")
      .select("id, user_id, request_date, requested_at, reason, status, approved_by, approved_at, rejection_note, created_at")
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);

    if (!isFullAccessUser) {
      const subRoles = new Set<string>();
      userRoles.forEach(r => (DIVISION_HEAD_MAP[r] ?? []).forEach(s => subRoles.add(s)));

      if (subRoles.size === 0) {
        q = q.eq("user_id", user.id);
      } else {
        const { data: subUsers } = await supabase.from("users").select("id").in("role", Array.from(subRoles));
        const ids = (subUsers ?? []).map((u: any) => u.id);
        if (!ids.includes(user.id)) ids.push(user.id);
        q = q.in("user_id", ids);
      }
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
    const { data: usersData } = userIds.length > 0
      ? await supabase.from("users").select("id, name, role").in("id", userIds)
      : { data: [] };
    const usersMap: Record<string, any> = {};
    (usersData ?? []).forEach((u: any) => { usersMap[u.id] = u; });

    const result = (data ?? []).map((r: any) => ({ ...r, users: usersMap[r.user_id] ?? null }));
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// ── POST — karyawan mengajukan izin pulang cepat untuk hari ini ─────────────
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const { reason } = body;
    if (!reason?.trim()) {
      return NextResponse.json({ success: false, message: "Alasan wajib diisi" }, { status: 400 });
    }

    const todayDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("early_checkout_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("request_date", todayDate)
      .in("status", ["PENDING", "APPROVED"])
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: false,
        message: existing.status === "APPROVED"
          ? "Izin pulang cepat hari ini sudah disetujui — silakan lanjut absen pulang."
          : "Kamu sudah mengajukan izin pulang cepat hari ini, tunggu persetujuan admin.",
      }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("early_checkout_requests")
      .insert({ user_id: user.id, request_date: todayDate, reason: reason.trim(), status: "PENDING" })
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// ── PATCH — admin/kepala divisi approve atau reject ─────────────────────────
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = await request.json();
    const { id, action, rejection_note } = body;
    if (!id || !action) {
      return NextResponse.json({ success: false, message: "id dan action wajib" }, { status: 400 });
    }

    const { data: reqRow, error: findError } = await supabase
      .from("early_checkout_requests")
      .select("*")
      .eq("id", id)
      .single();
    if (findError || !reqRow) {
      return NextResponse.json({ success: false, message: "Pengajuan tidak ditemukan" }, { status: 404 });
    }
    if (reqRow.status !== "PENDING") {
      return NextResponse.json({ success: false, message: `Pengajuan ini sudah berstatus ${reqRow.status}` }, { status: 400 });
    }

    const { data: targetUser } = await supabase.from("users").select("role").eq("id", reqRow.user_id).single();
    const userRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    if (!canApproveMulti(userRoles, targetUser?.role ?? "")) {
      return NextResponse.json({ success: false, message: "Kamu tidak berwenang menyetujui izin ini" }, { status: 403 });
    }

    if (action === "APPROVE") {
      const { data, error } = await supabase
        .from("early_checkout_requests")
        .update({ status: "APPROVED", approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    if (action === "REJECT") {
      const { data, error } = await supabase
        .from("early_checkout_requests")
        .update({ status: "REJECTED", approved_by: user.id, approved_at: new Date().toISOString(), rejection_note: rejection_note ?? null, updated_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: false, message: `Action tidak dikenal: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}