import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { slip_id } = body;

    if (!slip_id) {
      return NextResponse.json({ success: false, message: "slip_id wajib" }, { status: 400 });
    }

    // Ambil data slip lengkap
    const { data: slip, error: slipError } = await supabase
      .from("salary_slips")
      .select("*")
      .eq("id", slip_id)
      .single();

    if (slipError || !slip) {
      return NextResponse.json({ success: false, message: "Slip tidak ditemukan" }, { status: 404 });
    }

    // Ambil data user penerima
    const { data: recipient } = await supabase
      .from("users")
      .select("id, name, role")
      .eq("id", slip.user_id)
      .single();

    // Update status slip: tandai sudah dikirim
    const { data: updated, error: updateError } = await supabase
      .from("salary_slips")
      .update({
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        status: "FINALIZED", // auto-finalize saat dikirim
        finalized_at: slip.finalized_at ?? new Date().toISOString(),
      })
      .eq("id", slip_id)
      .select()
      .single();

    if (updateError) {
      console.error("[salary-slip/send] update error:", updateError);
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        recipient_name: recipient?.name,
        sent_by_name: user.name,
      },
    });
  } catch (err: any) {
    console.error("[salary-slip/send] exception:", err);
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

// Kirim ke semua user sekaligus (bulk send)
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !FULL_ACCESS_ROLES.includes(user.role)) {
      return NextResponse.json({ success: false, message: "Akses ditolak" }, { status: 403 });
    }

    const body = await request.json();
    const { year, month } = body;

    if (!year || !month) {
      return NextResponse.json({ success: false, message: "year dan month wajib" }, { status: 400 });
    }

    // Ambil semua slip bulan ini yang belum dikirim
    const { data: slips, error } = await supabase
      .from("salary_slips")
      .select("id")
      .eq("year", parseInt(String(year)))
      .eq("month", parseInt(String(month)))
      .is("sent_at", null);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    if (!slips || slips.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "Semua slip sudah terkirim" });
    }

    // Bulk update
    const { error: updateError } = await supabase
      .from("salary_slips")
      .update({
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        status: "FINALIZED",
        finalized_at: new Date().toISOString(),
      })
      .in("id", slips.map(s => s.id));

    if (updateError) {
      return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sent: slips.length });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}