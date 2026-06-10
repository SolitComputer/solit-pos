import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth } from "@/lib/auth";

async function handler(req: NextRequest) {
  try {
    const { data: laptops } = await supabase
      .from("laptops")
      .select("*")
      .eq("status", "SIAP_JUAL")
      .gt("qty", 0);

    // Group by grade
    const gradeMap: Record<string, { qty: number; items: any[] }> = {
      A: { qty: 0, items: [] },
      B: { qty: 0, items: [] },
      C: { qty: 0, items: [] },
    };

    laptops?.forEach((item) => {
      const grade = item.grade || "C";
      if (gradeMap[grade]) {
        gradeMap[grade].qty += item.qty || 0;
        gradeMap[grade].items.push(item);
      }
    });

    // Group by brand
    const brandMap: Record<string, number> = {};
    laptops?.forEach((item) => {
      const brand = item.brand || "Unknown";
      brandMap[brand] = (brandMap[brand] || 0) + (item.qty || 0);
    });

    const brandBreakdown = Object.entries(brandMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const summary = {
      total: laptops?.reduce((acc, item) => acc + (item.qty || 0), 0) || 0,
      totalModels: laptops?.length || 0,
      byGrade: {
        A: { qty: gradeMap.A.qty, pct: 0 },
        B: { qty: gradeMap.B.qty, pct: 0 },
        C: { qty: gradeMap.C.qty, pct: 0 },
      },
      byBrand: brandBreakdown,
    };

    // Calculate percentages
    const total = summary.total;
    if (total > 0) {
      summary.byGrade.A.pct = Math.round((summary.byGrade.A.qty / total) * 100);
      summary.byGrade.B.pct = Math.round((summary.byGrade.B.qty / total) * 100);
      summary.byGrade.C.pct = Math.round((summary.byGrade.C.qty / total) * 100);
    }

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_DASHBOARD);