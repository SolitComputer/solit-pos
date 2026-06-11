import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { PERMISSIONS, withAuth } from "@/lib/auth";

async function handler(req: NextRequest) {
  try {
    // ✅ QUERY DARI laptop_units (individual units dengan grade)
    const { data: units } = await supabase
      .from("laptop_units")
      .select("id, grade, laptop_id")
      .eq("status", "SIAP_JUAL");

    // ✅ QUERY DARI laptops (untuk brand breakdown)
    const { data: laptops } = await supabase
      .from("laptops")
      .select("id, brand, laptop_name, qty")
      .eq("status", "SIAP_JUAL")
      .gt("qty", 0);

    // ✅ GROUP BY GRADE (dari units)
    const gradeMap: Record<string, number> = {
      A: 0,
      B: 0,
      C: 0,
    };

    units?.forEach((unit) => {
      const grade = unit.grade || "C";
      if (gradeMap[grade] !== undefined) {
        gradeMap[grade]++;
      }
    });

    // ✅ GROUP BY BRAND
    const brandMap: Record<string, number> = {};
    laptops?.forEach((item) => {
      const brand = item.brand || "Unknown";
      brandMap[brand] = (brandMap[brand] || 0) + (item.qty || 0);
    });

    const brandBreakdown = Object.entries(brandMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // ✅ TOTAL UNITS & MODELS
    const totalUnits = units?.length || 0;
    const totalModels = laptops?.length || 0;

    const summary = {
      total: totalUnits,
      totalModels,
      byGrade: {
        A: { qty: gradeMap.A, pct: 0 },
        B: { qty: gradeMap.B, pct: 0 },
        C: { qty: gradeMap.C, pct: 0 },
      },
      byBrand: brandBreakdown,
    };

    // ✅ CALCULATE PERCENTAGES
    if (totalUnits > 0) {
      summary.byGrade.A.pct = Math.round((gradeMap.A / totalUnits) * 100);
      summary.byGrade.B.pct = Math.round((gradeMap.B / totalUnits) * 100);
      summary.byGrade.C.pct = Math.round((gradeMap.C / totalUnits) * 100);
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