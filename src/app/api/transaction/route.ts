import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/services/supabase";
import { createClient } from "@supabase/supabase-js";
import { withAuth, AuthUser, PERMISSIONS } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function handler(req: NextRequest, ctx: any, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "ALL";

    let query = supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Transaction query error:", error.message);
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    const transactions = data ?? [];

    const laptopIds = [...new Set(
      transactions
        .map((t: any) => t.laptop_id)
        .filter(Boolean)
    )] as string[];

    let laptopMap: Record<string, any> = {};

    if (laptopIds.length > 0) {
      const { data: laptops, error: laptopError } = await supabaseAdmin
        .from("laptops")
        .select("id, cpu, ram, storage, display, brand, gpu")
        .in("id", laptopIds);

      if (laptopError) {
        console.error("Laptop specs error:", laptopError.message);
      } else if (laptops) {
        laptopMap = Object.fromEntries(
          laptops.map((l: any) => [l.id, l])
        );
      }
    }

    const mapped = transactions.map((item: any) => {
      const specs = item.laptop_id ? laptopMap[item.laptop_id] : null;
      return {
        ...item,
        cpu:     specs?.cpu     ?? null,
        ram:     specs?.ram     ?? null,
        storage: specs?.storage ?? null,
        display: specs?.display ?? null,
        brand:   specs?.brand   ?? null,
        gpu:     specs?.gpu     ?? null,
      };
    });

    // ── Step 5: Filter pencarian ──────────────────────────────────────────
    const filtered = search.trim()
      ? mapped.filter((item: any) => {
          const kw = search.toLowerCase();
          return (
            item.customer_name?.toLowerCase().includes(kw) ||
            item.invoice_number?.toLowerCase().includes(kw) ||
            item.customer_phone?.toLowerCase().includes(kw) ||
            item.laptop_name?.toLowerCase().includes(kw)
          );
        })
      : mapped;

    return NextResponse.json({ success: true, data: filtered });

  } catch (err) {
    console.error("Handler error:", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export const GET = withAuth(handler, PERMISSIONS.VIEW_TRANSACTIONS);