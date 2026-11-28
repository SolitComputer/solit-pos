import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";
import { hasAnyRole, SALES_REPORT_AUDIT_ROLES } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function getUserRoles(user: AuthUser): string[] {
  const anyUser = user as any;
  return Array.isArray(anyUser?.roles) && anyUser.roles.length > 0
    ? anyUser.roles
    : [anyUser?.role].filter(Boolean);
}

// GET /api/marketing-awareness?from=YYYY-MM-DD&to=YYYY-MM-DD
async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Tidak punya akses" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabaseAdmin
      .from("marketing_awareness_reports")
      .select(`
        id,
        jangkauan,
        foto_bukti_url,
        tanggal,
        created_at,
        platform:platform_id ( id, platform, brand_toko, daftar_akun )
      `)
      .is("deleted_at", null);

    if (from) query = query.gte("tanggal", from);
    if (to) query = query.lte("tanggal", to);

    const { data, error } = await query
      .order("tanggal", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    // Hitung total jangkauan (awareness metric utama)
    const totalJangkauan = (data ?? []).reduce(
      (s: number, r: any) => s + Number(r.jangkauan ?? 0),
      0
    );

    return NextResponse.json({
      success: true,
      data: data ?? [],
      summary: { totalJangkauan, totalReports: (data ?? []).length },
    });
  } catch (error: any) {
    console.error("GET /api/marketing-awareness error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat data awareness" },
      { status: 500 }
    );
  }
}

// POST /api/marketing-awareness → tambah laporan awareness baru
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    if (!hasAnyRole(getUserRoles(user), SALES_REPORT_AUDIT_ROLES)) {
      return NextResponse.json(
        { success: false, message: "Tidak punya akses" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const platform_id = String(body.platform_id ?? "").trim();
    const jangkauan = Number(body.jangkauan ?? 0);
    const foto_bukti_url = body.foto_bukti_url ? String(body.foto_bukti_url) : null;
    const tanggal = String(body.tanggal ?? "").trim();

    if (!platform_id) {
      return NextResponse.json(
        { success: false, message: "Platform wajib dipilih" },
        { status: 400 }
      );
    }
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return NextResponse.json(
        { success: false, message: "Tanggal tidak valid (format YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(jangkauan) || jangkauan < 0) {
      return NextResponse.json(
        { success: false, message: "Jangkauan harus angka >= 0" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_awareness_reports")
      .insert({
        platform_id,
        jangkauan: Math.trunc(jangkauan),
        foto_bukti_url,
        tanggal,
        created_by: (user as any).id,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/marketing-awareness error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal menyimpan laporan" },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);