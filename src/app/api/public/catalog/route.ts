import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface UnitLite { status: string; selling_price: number | null; }
interface LaptopRow {
  id: string; laptop_name: string; brand: string | null;
  cpu: string | null; ram: string | null; storage: string | null;
  gpu: string | null; display: string | null; condition_note: string | null;
  selling_price: number | null; created_at: string;
  laptop_units: UnitLite[] | null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from("laptops")
      .select(`
        id, laptop_name, brand, cpu, ram, storage, gpu, display,
        condition_note, selling_price, created_at,
        laptop_units ( status, selling_price )
      `)
      .order("laptop_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400, headers: CORS }
      );
    }

    const catalog = ((data as LaptopRow[] | null) ?? [])
      .map((l) => {
        const ready = (l.laptop_units || []).filter((u) => u.status === "SIAP_JUAL");
        const stock = ready.length;

        // Harga headline: selling_price laptop; fallback ke unit SIAP_JUAL termurah
        const unitPrices = ready.map((u) => Number(u.selling_price) || 0).filter((p) => p > 0);
        const minUnit = unitPrices.length ? Math.min(...unitPrices) : 0;
        const price = Number(l.selling_price) > 0 ? Number(l.selling_price) : minUnit;

        return {
          id: l.id,
          laptop_name: l.laptop_name,
          brand: l.brand,
          cpu: l.cpu,
          ram: l.ram,
          storage: l.storage,
          gpu: l.gpu,
          display: l.display,
          condition_note: l.condition_note,
          price,
          stock,
          created_at: l.created_at,
        };
      })
      .filter((l) => l.stock > 0); // HANYA yang ada unit SIAP_JUAL

    return NextResponse.json({ success: true, data: catalog }, { headers: CORS });
  } catch (err) {
    console.error("[public/catalog]", err);
    return NextResponse.json(
      { success: false, message: "Internal error" },
      { status: 500, headers: CORS }
    );
  }
}