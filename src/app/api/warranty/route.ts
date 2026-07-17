import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonThreshold = new Date();
    soonThreshold.setDate(soonThreshold.getDate() + 7);

    const enriched = (data || []).map((w) => {
      const end = new Date(w.warranty_end);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let computedStatus = w.status;
      if (w.status !== "VOID") {
        if (daysLeft < 0) computedStatus = "EXPIRED";
        else if (daysLeft <= 7) computedStatus = "EXPIRING_SOON";
        else computedStatus = "ACTIVE";
      }

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