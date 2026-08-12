import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AKUNTANSI_MANAGE_ROLES } from "@/lib/permissions";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { periodFromDate } from "@/lib/accounting";

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const PUT = withAuth(async (req, _ctx, user: any) => {
  const body = await req.json();
  const { ids, targetDate } = body as {
    ids: string[];
    targetDate: string;
  };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ success: false, message: "Pilih minimal 1 jurnal" }, { status: 400 });
  }

  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json({ success: false, message: "Tanggal tujuan tidak valid" }, { status: 400 });
  }

  const period = periodFromDate(targetDate);
  const supabase = getAdmin();

  try {
    const { error } = await supabase
      .from("journal_entries")
      .update({
        tanggal: targetDate,
        period: period,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (error) {
      console.error("[akuntansi PUT move]", error);
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const auditLogs = ids.map((id) => ({
      entry_id: id,
      period,
      action: "EDIT",
      after_data: { moved_to_date: targetDate, period },
      changed_by: user.id,
    }));

    await supabase.from("journal_audit_logs").insert(auditLogs);

    return NextResponse.json({
      success: true,
      message: `${ids.length} jurnal berhasil dipindahkan`,
      count: ids.length,
      targetDate,
      period,
    });
  } catch (error: any) {
    console.error("[akuntansi PUT move]", error);
    return NextResponse.json({ success: false, message: error?.message ?? "Gagal memindahkan jurnal" }, { status: 500 });
  }
}, AKUNTANSI_MANAGE_ROLES);
