import { NextRequest, NextResponse } from "next/server";
import { getHealth, getHealthAll, disconnect } from "@/lib/ccTikTok";
import { normalizeBrand, DEFAULT_BRAND } from "@/lib/ccReports";

export const dynamic = "force-dynamic";

// GET /api/cc-reports/tiktok/status         → { success, brands: {brand: health}, ...healthSolit }
// GET /api/cc-reports/tiktok/status?brand=X → { success, ...healthX } (1 brand)
export async function GET(req: NextRequest) {
  const brandParam = req.nextUrl.searchParams.get("brand");

  if (brandParam) {
    const health = await getHealth(normalizeBrand(brandParam));
    return NextResponse.json({ success: true, ...health });
  }

  const brands = await getHealthAll();
  // spread health brand default di root → tetap kompatibel dengan pemanggil lama (single-brand)
  return NextResponse.json({ success: true, brands, ...brands[DEFAULT_BRAND] });
}

// DELETE /api/cc-reports/tiktok/status?brand=X → putus 1 brand (default Solit)
export async function DELETE(req: NextRequest) {
  const brand = normalizeBrand(req.nextUrl.searchParams.get("brand"));
  await disconnect(brand);
  return NextResponse.json({ success: true });
}