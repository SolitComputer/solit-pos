import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FUND_EXECUTOR_IDS, FUND_APPROVER_IDS } from "@/lib/fundConfig";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── PATCH: approve atau execute pengajuan dana ────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = request.headers.get("x-user-id");
  const userName = decodeURIComponent(request.headers.get("x-user-name") || "");

  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body tidak valid" }, { status: 400 });
  }

  const { action } = body;
  const supabase = db();

  // ── Approve ─────────────────────────────────────────────────────────────────
  if (action === "approve") {
    if (!FUND_APPROVER_IDS.includes(userId)) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki wewenang untuk menyetujui" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("fund_requests")
      .update({
        is_approved: true,
        approved_by_id: userId,
        approved_by_name: userName,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  }

  // ── Batal Approve (un-approve) ──────────────────────────────────────────────
  if (action === "unapprove") {
    if (!FUND_APPROVER_IDS.includes(userId)) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki wewenang" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("fund_requests")
      .update({
        is_approved: false,
        approved_by_id: null,
        approved_by_name: null,
        approved_at: null,
      })
      .eq("id", id)
      .eq("is_executed", false) // tidak bisa un-approve kalau sudah dieksekusi
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  if (action === "execute") {
    if (!FUND_EXECUTOR_IDS.includes(userId)) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki wewenang untuk mengeksekusi" },
        { status: 403 }
      );
    }

    // Cek apakah sudah disetujui dulu
    const { data: existing } = await supabase
      .from("fund_requests")
      .select("is_approved")
      .eq("id", id)
      .single();

    if (!existing?.is_approved) {
      return NextResponse.json(
        { success: false, message: "Pengajuan harus disetujui dulu sebelum dieksekusi" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("fund_requests")
      .update({
        is_executed: true,
        executed_by_id: userId,
        executed_by_name: userName,
        executed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  }

  // ── Batal Execute (un-execute) ──────────────────────────────────────────────
  if (action === "unexecute") {
    if (!FUND_EXECUTOR_IDS.includes(userId)) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki wewenang" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("fund_requests")
      .update({
        is_executed: false,
        executed_by_id: null,
        executed_by_name: null,
        executed_at: null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  }

  return NextResponse.json({ success: false, message: "Action tidak valid" }, { status: 400 });
}

// ── DELETE: hapus pengajuan dana ──────────────────────────────────────────────
// Hanya requester sendiri (belum disetujui) atau ADMIN/PROGRAMMER yang boleh hapus.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = request.headers.get("x-user-id");
  const roles = (request.headers.get("x-user-roles") || "").split(",").filter(Boolean);

  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const supabase = db();

  // Ambil data dulu untuk cek ownership
  const { data: existing, error: fetchErr } = await supabase
    .from("fund_requests")
    .select("requester_id, is_approved")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
  }

  const isAdmin = roles.some((r) => ["ADMIN", "PROGRAMMER"].includes(r));
  const isOwner = existing.requester_id === userId;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  // Owner hanya bisa hapus kalau belum disetujui
  if (isOwner && !isAdmin && existing.is_approved) {
    return NextResponse.json(
      { success: false, message: "Tidak bisa menghapus pengajuan yang sudah disetujui" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("fund_requests").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}