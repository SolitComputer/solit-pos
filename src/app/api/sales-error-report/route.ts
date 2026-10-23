import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabase-paginate";
import { resolveDateRangeUtc } from "@/lib/marketing-report";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TABLE = "sales_online_reports";
const META = "sales_error_meta";

function getRoles(user: AuthUser): string[] {
  const u = user as any;
  return Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/sales-error-report?date=YYYY-MM-DD
async function getHandler(req: NextRequest) {
  try {
    const date = new URL(req.url).searchParams.get("date") || "";
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ success: false, message: "date wajib (YYYY-MM-DD)" }, { status: 400 });
    }
    // Batas hari (WIB) → UTC, pakai helper yang sama dengan tab marketing lain.
    const range = resolveDateRangeUtc(date, date);
    if (!range.success) return NextResponse.json({ success: false, message: range.error }, { status: 400 });
    const { startUtc, endUtc } = range.value;

    const { data, error } = await fetchAllRows((from, to) => {
      let q = supabaseAdmin
        .from(TABLE)
        .select("filled_by_name, audited, rejected, reject_reason")
        .is("deleted_at", null);
      if (startUtc) q = q.gte("created_at", startUtc);
      if (endUtc) q = q.lt("created_at", endUtc);
      return q.range(from, to);
    });
    if (error) throw new Error(error.message);

    // Agregasi per nama sales (nama muncul walau laporannya masih pending).
    const map = new Map<string, { total_lead: number; chat: number; salah: number; data: number }>();
    for (const r of data ?? []) {
      const name = ((r as any).filled_by_name || "Tanpa Nama").trim();
      let g = map.get(name);
      if (!g) { g = { total_lead: 0, chat: 0, salah: 0, data: 0 }; map.set(name, g); }
      if ((r as any).rejected) {
        const reason = (r as any).reject_reason;
        if (reason === "CHAT_TIDAK_TERBALAS") g.chat++;
        else if (reason === "SALAH_INPUT") g.salah++;
        else if (reason === "DATA_TIDAK_SESUAI") g.data++;
      } else if ((r as any).audited) {
        g.total_lead++; // Total Lead = approved saja (bukan ditolak)
      }
    }

    // Gabung meta manual (akun/device, catatan, warna) untuk tanggal ini.
    const { data: metaRows } = await supabaseAdmin
      .from(META)
      .select("sales_name, akun_device, catatan, colors")
      .eq("report_date", date);
    const metaMap = new Map((metaRows ?? []).map((m: any) => [m.sales_name, m]));

    const rows = Array.from(map.entries())
      .map(([sales_name, g]) => {
        const m = metaMap.get(sales_name);
        return {
          sales_name,
          total_lead: g.total_lead,
          chat: g.chat,
          salah: g.salah,
          data: g.data,
          akun_device: m?.akun_device ?? "",
          catatan: m?.catatan ?? "",
          colors: (m?.colors ?? {}) as Record<string, string>,
        };
      })
      .sort((a, b) => a.sales_name.localeCompare(b.sales_name, "id"));

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("Sales error report GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PATCH /api/sales-error-report?date=YYYY-MM-DD  { sales_name, akun_device?, catatan?, colors? }
async function patchHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getRoles(user), SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json({ success: false, message: "Role Anda tidak diizinkan mengubah tabel ini" }, { status: 403 });
    }
    const date = new URL(req.url).searchParams.get("date") || "";
    if (!DATE_RE.test(date)) return NextResponse.json({ success: false, message: "date wajib (YYYY-MM-DD)" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const sales_name = (body?.sales_name ?? "").toString().trim();
    if (!sales_name) return NextResponse.json({ success: false, message: "sales_name wajib" }, { status: 400 });

    const patch: Record<string, any> = { report_date: date, sales_name, updated_at: new Date().toISOString() };
    if (typeof body.akun_device === "string") patch.akun_device = body.akun_device;
    if (typeof body.catatan === "string") patch.catatan = body.catatan;
    if (body.colors && typeof body.colors === "object") patch.colors = body.colors;

    const { data, error } = await supabaseAdmin
      .from(META)
      .upsert(patch, { onConflict: "report_date,sales_name" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Sales error report PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);