import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";
import { computeWarrantyStatus } from "@/lib/warranty";

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "ALL";
    const includeArchived = searchParams.get("archived") === "true";

    // Toleransi 90 hari (3 bulan) setelah expired
    const toleranceDate = new Date();
    toleranceDate.setDate(toleranceDate.getDate() - 90);
    const toleranceDateStr = toleranceDate.toISOString().split("T")[0];

    let query = supabase
      .from("warranties")
      .select("*")
      .order("warranty_end", { ascending: true });

    // Filter arsip: sembunyikan yang expired > 90 hari
    if (!includeArchived) {
      query = query.gte("warranty_end", toleranceDateStr);
    }

    if (status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    // Auto-update status berdasarkan tanggal hari ini
    // ✅ FIX: dulu status yang sudah diedit manual (mis. dipaksa ACTIVE) selalu
    // ditimpa balik oleh hitungan tanggal di sini setiap kali data di-refresh
    // — perubahan manual jadi hilang kecuali statusnya VOID. Sekarang kalau
    // baris punya manual_status_override=true, status tersimpan (hasil edit
    // admin) yang dipakai apa adanya, bukan dihitung ulang dari tanggal.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonThreshold = new Date();
    soonThreshold.setDate(soonThreshold.getDate() + 7);

    const enriched = (data || []).map((w) => {
      const { computedStatus: autoStatus, daysLeft } = computeWarrantyStatus(w.warranty_end, w.status);
      const computedStatus = w.manual_status_override ? w.status : autoStatus;

      return { ...w, computed_status: computedStatus, days_left: daysLeft };
    });

    // Filter search
    const filtered = search.trim()
      ? enriched.filter((w) => {
          const kw = search.toLowerCase();
          return (
            w.serial_number?.toLowerCase().includes(kw) ||
            w.customer_name?.toLowerCase().includes(kw) ||
            w.customer_phone?.toLowerCase().includes(kw) ||
            w.laptop_name?.toLowerCase().includes(kw) ||
            w.invoice_number?.toLowerCase().includes(kw)
          );
        })
      : enriched;

    // Filter computed status
    const result =
      status !== "ALL"
        ? filtered.filter((w) => w.computed_status === status)
        : filtered;

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_WARRANTY);