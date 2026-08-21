import { supabase } from "@/services/supabase";

// Nomor order: PREP-YYYYMMDD-XXXX
// Dipakai bersama oleh api/preparation/route.ts (Penyiapan normal) dan
// api/preparation/direct/route.ts (Pengantaran langsung) — satu sumber
// kebenaran, tidak boleh ada 2 implementasi beda yang bisa drift.
export async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const prefix = `PREP-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const { data } = await supabase
    .from("preparation_orders")
    .select("order_number")
    .like("order_number", `${prefix}%`)
    .order("order_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const lastNum = parseInt(data[0].order_number.split("-").pop() ?? "0", 10);
    if (!isNaN(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}