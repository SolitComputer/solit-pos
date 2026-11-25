import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PARTNER_MANAGE_ROLES } from "@/lib/permissions";

// ── GET /api/partners ───────────────────────────────────────────────────────
// Internal (auth required via middleware). List semua partners.
// Query params: ?status=PENDING|APPROVED|REJECTED  &type=MITRA|RESELLER  &search=...

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const statusFilter = searchParams.get("status"); // PENDING | APPROVED | REJECTED
  const typeFilter = searchParams.get("type");       // MITRA | RESELLER
  const search = searchParams.get("search")?.trim();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let query = supabase
    .from("partners")
    .select(`
      *,
      referrer:referred_by_user_id ( id, name ),
      approver:approved_by ( id, name ),
      rejector:rejected_by ( id, name )
    `)
    .order("created_at", { ascending: false });

  if (statusFilter && ["PENDING", "APPROVED", "REJECTED"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  if (typeFilter && ["MITRA", "RESELLER"].includes(typeFilter)) {
    query = query.eq("type", typeFilter);
  }
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[partners] GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// ── PATCH /api/partners ─────────────────────────────────────────────────────
// Approve atau Reject pendaftaran. Body: { id, action: "approve"|"reject", rejection_reason?, notes? }

export async function PATCH(request: NextRequest) {
  const userRoles = (request.headers.get("x-user-roles") ?? "").split(",").filter(Boolean);
  const userId = request.headers.get("x-user-id") ?? "";

  // Gate: hanya PARTNER_MANAGE_ROLES yang boleh approve/reject
  if (!userRoles.some((r) => (PARTNER_MANAGE_ROLES as string[]).includes(r))) {
    return NextResponse.json(
      { success: false, message: "Anda tidak punya akses untuk melakukan aksi ini" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { id, action, rejection_reason, notes } = body;

    if (!id || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "Parameter id dan action (approve/reject) wajib" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Cek partner exist & masih PENDING
    const { data: partner } = await supabase
      .from("partners")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (!partner) {
      return NextResponse.json(
        { success: false, message: "Data pendaftaran tidak ditemukan" },
        { status: 404 }
      );
    }
    if (partner.status !== "PENDING") {
      return NextResponse.json(
        { success: false, message: `Pendaftaran ini sudah di-${partner.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (action === "approve") {
      const { error } = await supabase
        .from("partners")
        .update({
          status: "APPROVED",
          approved_at: now,
          approved_by: userId,
          notes: notes || null,
          updated_at: now,
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Pendaftaran berhasil di-approve",
      });
    }

    // action === "reject"
    if (!rejection_reason?.trim()) {
      return NextResponse.json(
        { success: false, message: "Alasan penolakan wajib diisi" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("partners")
      .update({
        status: "REJECTED",
        rejected_at: now,
        rejected_by: userId,
        rejection_reason: rejection_reason.trim(),
        notes: notes || null,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Pendaftaran ditolak",
    });
  } catch (err) {
    console.error("[partners] PATCH error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}