import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/services/supabaseAdmin";
import { withAuth, AuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABLE = "sales_online_reports";
const NO_PHONE_CHANNELS = ["MITRA", "RESELLER"];
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta = UTC+7

// Hitung batas awal periode ("today" | "week" | "month") dalam waktu WIB,
// lalu kembalikan sebagai ISO string UTC untuk query `.gte("created_at", ...)`.
function getPeriodStartUtc(period: string): string {
  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const startOfDayWib = new Date(
    Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate())
  );

  let startWib = startOfDayWib;
  if (period === "week") {
    const day = startOfDayWib.getUTCDay(); // 0 = Minggu
    const diffToMonday = day === 0 ? 6 : day - 1;
    startWib = new Date(startOfDayWib);
    startWib.setUTCDate(startWib.getUTCDate() - diffToMonday);
  } else if (period === "month") {
    startWib = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), 1));
  }

  return new Date(startWib.getTime() - WIB_OFFSET_MS).toISOString();
}

// Validasi + normalisasi body form Tambah/Edit — dipakai bareng oleh POST & PATCH.
function validateAndNormalize(body: any) {
  const channel = (body.channel ?? "").toString();
  const phone_number = (body.phone_number ?? "").toString().trim();
  const partner_name = (body.partner_name ?? "").toString().trim();
  const interest = (body.interest ?? "").toString().trim();
  const keterangan = (body.keterangan ?? "").toString().trim();
  const purchased = Boolean(body.purchased);
  const isNoPhone = NO_PHONE_CHANNELS.includes(channel);

  if (!interest) return { error: "Minat wajib diisi" as const };
  if (isNoPhone && !partner_name) return { error: "Nama mitra/reseller wajib diisi" as const };
  if (!isNoPhone && !phone_number) return { error: "Nomor telepon wajib diisi" as const };

  return {
    value: {
      channel,
      phone_number: isNoPhone ? null : phone_number,
      partner_name: isNoPhone ? partner_name : null,
      interest,
      keterangan: keterangan || null,
      purchased,
    },
  };
}

// GET /api/sales-reports?period=today|week|month
async function getHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "today";
    const startUtc = getPeriodStartUtc(period);

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .gte("created_at", startUtc)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Sales report list error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST /api/sales-reports  { channel, phone_number, partner_name, interest, keterangan, purchased }
async function postHandler(req: NextRequest, _ctx: any, user: AuthUser) {
  try {
    const body = await req.json();
    const { error: validationError, value } = validateAndNormalize(body);
    if (validationError) {
      return NextResponse.json({ success: false, message: validationError }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({ ...value, filled_by: user.id, filled_by_name: user.name, audited: false })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Sales report create error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PATCH /api/sales-reports?id=xxx  { channel, phone_number, partner_name, interest, keterangan, purchased }
async function patchHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });
    }

    const body = await req.json();
    const { error: validationError, value } = validateAndNormalize(body);
    if (validationError) {
      return NextResponse.json({ success: false, message: validationError }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from(TABLE)
      .select("id, audited")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
    }
    if (existing.audited) {
      return NextResponse.json(
        { success: false, message: "Laporan yang sudah diaudit tidak bisa diedit" },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(value)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Sales report update error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE /api/sales-reports?id=xxx
async function deleteHandler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "id wajib diisi" }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from(TABLE)
      .select("id, audited")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ success: false, message: "Data tidak ditemukan" }, { status: 404 });
    }
    if (existing.audited) {
      return NextResponse.json(
        { success: false, message: "Laporan yang sudah diaudit tidak bisa dihapus" },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sales report delete error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);