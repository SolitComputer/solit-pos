import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const TABLE = "ads_report_rows";
const SECTIONS = ["ringkasan", "fb_toko", "shopee", "fb_pribadi"];

function getRoles(user: AuthUser): string[] {
  const u = user as any;
  return Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
}
function canManage(user: AuthUser) {
  return hasAnyRole(getRoles(user), SALES_REPORT_AUDIT_ROLES);
}

// "2026-10" → { start: "2026-10-01", end: "2026-11-01" } (end eksklusif).
// report_date bertipe `date` (bukan timestamptz) — jadi TIDAK perlu konversi
// WIB, beda dengan created_at di tabel lain.
function monthRangeUtc(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}

// GET /api/ads-report?section=ringkasan&month=YYYY-MM
async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section") || "";
    if (!SECTIONS.includes(section)) {
      return NextResponse.json({ success: false, message: "section tidak valid" }, { status: 400 });
    }
    // month kosong/invalid → fallback bulan berjalan, supaya endpoint tetap
    // aman kalau ada client lama yang belum kirim parameter ini.
    const monthParam = searchParams.get("month") || "";
    const range = monthRangeUtc(monthParam) ?? monthRangeUtc(new Date().toISOString().slice(0, 7))!;

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("section", section)
      .gte("report_date", range.start)
      .lt("report_date", range.end)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Task 1: Total Modal Laptop (otomatis) — hanya untuk tab Ringkasan CEO.
    // = jumlah inventory_price transaksi LUNAS (PAID) di bulan yang sama.
    // Batas pakai WIB (created_at timestamptz), beda dgn report_date (date) di atas.
    let modalLaptop = 0;
    if (section === "ringkasan") {
      const [yy, mm] = range.start.split("-").map(Number); // range.start = "YYYY-MM-01"
      const startTs = new Date(`${range.start}T00:00:00+07:00`).toISOString();
      const nextStr = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
      const endTs = new Date(`${nextStr}T00:00:00+07:00`).toISOString();
      const { data: trx, error: trxErr } = await supabaseAdmin
        .from("transactions")
        .select("inventory_price")
        .eq("status", "PAID")
        .gte("created_at", startTs)
        .lt("created_at", endTs);
      if (trxErr) throw new Error(trxErr.message);
      modalLaptop = (trx ?? []).reduce((s: number, t: any) => s + (Number(t.inventory_price) || 0), 0);
    }

    return NextResponse.json({ success: true, data: data ?? [], modalLaptop });
  } catch (error: any) {
    console.error("Ads report GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST /api/ads-report?section=ringkasan&month=YYYY-MM  → baris baru kosong
// Baris baru di-tanggal-i tanggal 1 di bulan yang SEDANG DIBUKA di UI (bukan
// hari ini), supaya "Baris Baru" saat browsing bulan lalu/depan tidak nyasar
// ke bulan berjalan.
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!canManage(user)) return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section") || "";
    if (!SECTIONS.includes(section)) return NextResponse.json({ success: false, message: "section tidak valid" }, { status: 400 });
    const range = monthRangeUtc(searchParams.get("month") || "");
    if (!range) return NextResponse.json({ success: false, message: "month tidak valid (format YYYY-MM)" }, { status: 400 });

    const { data: last } = await supabaseAdmin
      .from(TABLE).select("sort_order").eq("section", section)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const sort_order = (last?.sort_order ?? -1) + 1;

    const { data, error } = await supabaseAdmin
      .from(TABLE).insert({ section, sort_order, data: {}, report_date: range.start }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Ads report POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PATCH /api/ads-report?id=xxx  { data }
async function patchHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!canManage(user)) return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "id wajib" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    if (typeof body.data !== "object" || body.data === null) {
      return NextResponse.json({ success: false, message: "data wajib object" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from(TABLE).update({ data: body.data, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Ads report PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE /api/ads-report?id=xxx
async function deleteHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!canManage(user)) return NextResponse.json({ success: false, message: "Tidak diizinkan" }, { status: 403 });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "id wajib" }, { status: 400 });
    const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Ads report DELETE error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);