import { supabase } from "@/services/supabase";

export async function generateInvoice(): Promise<string> {
  const now = new Date();

  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day   = String(now.getDate()).padStart(2, "0");

  const datePrefix = `INV-${year}${month}${day}-`;

  const { data } = await supabase
    .from("transactions")
    .select("invoice_number")
    .like("invoice_number", `${datePrefix}%`)
    .order("invoice_number", { ascending: false });

  let nextNumber = 1;

  if (data && data.length > 0) {
    const numbers = data
      .map(row => {
        const suffix = row.invoice_number.replace(datePrefix, "");
        return parseInt(suffix, 10);
      })
      .filter(n => !isNaN(n));

    if (numbers.length > 0) {
      nextNumber = Math.max(...numbers) + 1;
    }
  }

  const sequence = String(nextNumber).padStart(3, "0");
  return `${datePrefix}${sequence}`;
}