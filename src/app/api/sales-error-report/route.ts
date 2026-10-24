import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { resolveDateRangeUtc } from "@/lib/marketing-report";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TABLE = "sales_online_reports";
const META = "sales_error_meta";
const AKUN = "sales_akun_device";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getRoles(user: AuthUser): string[] {
  const u = user as any;
  return Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
}

// GET /api/sales-error-report?date=YYYY-MM-DD
async function getHandler(req: NextRequest) {
  try {
    const date = new URL(req.url).searchParams.get("date") || "";
    if (!DATE_RE.test(date)) return NextResponse.json({ success: false, message: "date wajib (YYYY-MM-DD)" }, { status: 400 });
    const range = resolveDateRangeUtc(date, date);
    if (!range.success) return NextResponse.json({ success: false, message: range.error }, { status: 400 });
    const { startUtc, endUtc } = range.value;

    const { data, error } = await fetchAllRows((from, to) => {
      let q = supabaseAdmin.from(TABLE)
        .select("filled_by, audited, rejected, reject_reason")
        .is("deleted_at", null);
      if (startUtc) q = q.gte("created_at", startUtc);
      if (endUtc) q = q.lt("created_at", endUtc);
      return q.range(from, to);
    });
    if (error) throw new Error(error.message);

    // Counts per user_id (filled_by) — cocok persis, tanpa nebak nama.
    const counts: Record<string, { total_lead: number; chat: number; salah: number; data: number }> = {};
    for (const r of data ?? []) {
      const id = (r as any).filled_by;
      if (!id) continue;
      if (!counts[id]) counts[id] = { total_lead: 0, chat: 0, salah: 0, data: 0 };
      const g = counts[id];
      if ((r as any).rejected) {
        const reason = (r as any).reject_reason;
        if (reason === "CHAT_TIDAK_TERBALAS") g.chat++;
        else if (reason === "SALAH_INPUT") g.salah++;
        else if (reason === "DATA_TIDAK_SESUAI") g.data++;
      } else if ((r as any).audited) g.total_lead++;
    }

    // Akun/Device GLOBAL (key = rosterKey)
    const { data: akunRows } = await supabaseAdmin.from(AKUN).select("sales_name, akun_device");
    const akun: Record<string, string> = {};
    for (const a of akunRows ?? []) akun[(a as any).sales_name] = (a as any).akun_device ?? "";

    // Catatan + warna per tanggal (key = rosterKey)
    const { data: metaRows } = await supabaseAdmin.from(META).select("sales_name, catatan, colors").eq("report_date", date);
    const meta: Record<string, { catatan: string; colors: Record<string, string> }> = {};
    for (const m of metaRows ?? []) meta[(m as any).sales_name] = { catatan: (m as any).catatan ?? "", colors: ((m as any).colors ?? {}) };

    return NextResponse.json({ success: true, data: { counts, akun, meta } });
  } catch (error: any) {
    console.error("Sales error report GET:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PATCH /api/sales-error-report?date=YYYY-MM-DD  { sales_name, akun_device?, catatan?, colors? }
// (sales_name = rosterKey: user_id kalau ada, atau "name:<nama>")
async function patchHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getRoles(user), SALES_REPORT_AUDIT_ROLES))
      return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });
    const date = new URL(req.url).searchParams.get("date") || "";
    const body = await req.json().catch(() => ({}));
    const sales_name = (body?.sales_name ?? "").toString().trim();
    if (!sales_name) return NextResponse.json({ success: false, message: "sales_name wajib" }, { status: 400 });

    if (typeof body.akun_device === "string") {
      const { error } = await supabaseAdmin.from(AKUN)
        .upsert({ sales_name, akun_device: body.akun_device, updated_at: new Date().toISOString() }, { onConflict: "sales_name" });
      if (error) throw new Error(error.message);
    }
    if (typeof body.catatan === "string" || (body.colors && typeof body.colors === "object")) {
      if (!DATE_RE.test(date)) return NextResponse.json({ success: false, message: "date wajib untuk catatan/warna" }, { status: 400 });
      const patch: any = { report_date: date, sales_name, updated_at: new Date().toISOString() };
      if (typeof body.catatan === "string") patch.catatan = body.catatan;
      if (body.colors && typeof body.colors === "object") patch.colors = body.colors;
      const { error } = await supabaseAdmin.from(META).upsert(patch, { onConflict: "report_date,sales_name" });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sales error report PATCH:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);