// src/app/receipt/[invoice]/struk/page.tsx
// Halaman KHUSUS struk termal (80mm) — full 1 halaman, siap di-print.
import { supabase } from "@/services/supabase";
import Link from "next/link";
import ThermalReceipt from "@/app/receipt/ThermalReceipt";
import { buildLineItemsFromTxItems } from "@/lib/receiptItems";
import PrintToolbar from "./PrintToolbar";

interface Props {
  params: Promise<{ invoice: string }>;
}

export default async function StrukPage(props: Props) {
  const params = await props.params;

  const [{ data }, { data: warranty }, { data: txItems }] = await Promise.all([
    supabase.from("transactions").select("*").eq("invoice_number", params.invoice).single(),
    supabase.from("warranties").select("warranty_end").eq("invoice_number", params.invoice).single(),
    supabase
      .from("transaction_items")
      .select("item_type, item_name, serial_number, quantity, deal_price, is_bonus, unit_id, accessory_id")
      .eq("invoice_number", params.invoice),
  ]);

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white p-6 text-center">
        <div>
          <p className="font-semibold text-gray-700">Transaksi tidak ditemukan</p>
          <Link href="/dashboard" className="mt-2 inline-block text-sm text-blue-600">
            ← Kembali ke Dashboard
          </Link>
        </div>
      </main>
    );
  }

  // ── Enrich harga jual resmi (buat coretan diskon) — sama seperti card ──
  const rawTxItems = txItems ?? [];
  const laptopItems = rawTxItems.filter((it: any) => it.item_type !== "accessory");
  const accessoryItems = rawTxItems.filter((it: any) => it.item_type === "accessory");

  const unitIds = [...new Set(laptopItems.filter((it: any) => it.unit_id).map((it: any) => it.unit_id))];
  const accessoryIds = [...new Set(accessoryItems.filter((it: any) => it.accessory_id).map((it: any) => it.accessory_id))];

  const [{ data: unitPricesData }, { data: accPricesData }] = await Promise.all([
    unitIds.length > 0
      ? supabase.from("laptop_units").select("id, selling_price").in("id", unitIds)
      : Promise.resolve({ data: [] as any[] }),
    accessoryIds.length > 0
      ? supabase.from("accessories").select("id, sell_price").in("id", accessoryIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const unitOfficialMap = new Map((unitPricesData ?? []).map((u: any) => [u.id, Number(u.selling_price) || 0]));
  const accOfficialMap = new Map((accPricesData ?? []).map((a: any) => [a.id, Number(a.sell_price) || 0]));

  const enrichedTxItems = rawTxItems.map((it: any) => {
    const qty = Number(it.quantity) || 1;
    const officialUnit = it.item_type === "accessory"
      ? (accOfficialMap.get(it.accessory_id) ?? 0)
      : (unitOfficialMap.get(it.unit_id) ?? 0);
    return { ...it, official_price: officialUnit * qty };
  });

  const lineItems = buildLineItemsFromTxItems(enrichedTxItems);

  const warrantyEndLabel = warranty?.warranty_end
    ? new Date(warranty.warranty_end).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : undefined;

  const dateLabel = new Date(data.paid_at || data.created_at).toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta",
  });

  return (
    <main className="min-h-screen bg-slate-200 flex flex-col items-center gap-6 py-8 print:block print:bg-white print:p-0 print:m-0">
      <PrintToolbar invoice={data.invoice_number} />

      {/* Kertas struk */}
      <div id="struk-paper" className="bg-white shadow-xl print:shadow-none">
        <ThermalReceipt
          invoiceNumber={data.invoice_number}
          dateLabel={dateLabel}
          customerName={data.customer_name || undefined}
          items={lineItems}
          total={data.amount || 0}
          paymentMethod={data.payment_method || undefined}
          warrantyEndLabel={warrantyEndLabel}
        />
      </div>

      <style>{`
        @media print {
          @page { margin: 0; size: 80mm auto; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          #struk-paper { box-shadow: none !important; }
        }
      `}</style>
    </main>
  );
}