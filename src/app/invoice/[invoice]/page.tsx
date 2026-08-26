import { supabase } from "@/services/supabase";
import Link from "next/link";
import { buildLineItemsFromTxItems, sumLineItems } from "@/lib/receiptItems";

interface Props {
  params: Promise<{ invoice: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  RESERVED: "DP / Uang Muka",
  HELD: "Ambil Dulu — Belum Lunas",
  PACKING: "Packing — Belum Lunas",
  PENDING: "Menunggu Pembayaran",
};

export default async function InvoicePage(props: Props) {
  const params = await props.params;

  const [{ data }, { data: txItems }] = await Promise.all([
    supabase.from("transactions").select("*").eq("invoice_number", params.invoice).single(),
    supabase
      .from("transaction_items")
      .select("item_type, item_name, serial_number, quantity, deal_price, is_bonus")
      .eq("invoice_number", params.invoice),
  ]);

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 p-5">
        <div className="bg-white border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-800">Invoice Tidak Ditemukan</h1>
          <p className="text-gray-500 text-sm">Periksa kembali nomor invoice.</p>
          <Link href="/dashboard/pending-orders" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mt-2">
            ← Kembali ke Riwayat Pending
          </Link>
        </div>
      </main>
    );
  }

  if (data.status === "PAID") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 p-5">
        <div className="bg-white border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-800">Transaksi Sudah Lunas</h1>
          <p className="text-gray-500 text-sm">Gunakan Nota untuk transaksi yang sudah dibayar.</p>
          <Link href={`/receipt/${params.invoice}`} className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition mt-2 font-semibold">
            Lihat Nota →
          </Link>
        </div>
      </main>
    );
  }

  if (data.status === "CANCELLED") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 p-5">
        <div className="bg-white border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-800">Pesanan Dibatalkan</h1>
          <p className="text-gray-500 text-sm">Invoice ini sudah tidak berlaku.</p>
          <Link href="/dashboard/pending-orders" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mt-2">
            ← Kembali ke Riwayat Pending
          </Link>
        </div>
      </main>
    );
  }

  const lineItems = buildLineItemsFromTxItems(txItems ?? []);
  const subtotal = sumLineItems(lineItems) || Number(data.deal_price ?? data.amount ?? 0);
  const dpPaid = Number(data.dp_amount ?? 0);
  const remaining = Math.max(0, subtotal - dpPaid);

  const invoiceDate = new Date(data.created_at).toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <main className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto mb-4 no-capture">
        <Link
          href="/dashboard/pending-orders"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Kembali ke Riwayat Pending
        </Link>
      </div>

      {/* Lembar invoice — dibuat menyerupai layout dokumen Excel kalian */}
      <div id="invoice-card" className="bg-white max-w-2xl mx-auto shadow-sm print:shadow-none border border-gray-300 p-8 sm:p-10 text-gray-800 font-sans">

        {/* Header: identitas toko kiri, judul + tanggal kanan */}
        <div className="flex flex-wrap justify-between items-start gap-4 pb-5 border-b-2 border-gray-800">
          <div>
            <h2 className="text-lg font-bold uppercase tracking-wide">Solit Computer</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Kavling Adhikarya No. 77, Rangkapan Jaya Lama<br />
              Kota Depok, Jawa Barat. Kode Pos 16431
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-[0.15em] text-gray-800">INVOICE</h1>
            <p className="text-xs text-gray-500 mt-1">No: <span className="font-mono font-semibold text-gray-700">{data.invoice_number}</span></p>
            <p className="text-xs text-gray-500">Tanggal: {invoiceDate}</p>
            <p className="text-[11px] text-amber-700 font-semibold mt-1">{STATUS_LABEL[data.status] ?? data.status}</p>
          </div>
        </div>

        {/* Kepada */}
        <div className="py-5 border-b border-gray-200">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Kepada</p>
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="pr-4 py-0.5 text-gray-500 align-top whitespace-nowrap">Nama</td>
                <td className="py-0.5">: {data.customer_name || "-"}</td>
              </tr>
              <tr>
                <td className="pr-4 py-0.5 text-gray-500 align-top whitespace-nowrap">Alamat</td>
                <td className="py-0.5">: {data.pickup_location || "-"}</td>
              </tr>
              {data.customer_phone && (
                <tr>
                  <td className="pr-4 py-0.5 text-gray-500 align-top whitespace-nowrap">Telepon</td>
                  <td className="py-0.5">: {data.customer_phone}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Tabel rincian barang — Jml / Deskripsi / Harga Satuan / Total, gaya grid Excel */}
        <table className="w-full text-sm my-6 border-collapse">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="border border-gray-800 px-3 py-2 text-center w-14">Jml</th>
              <th className="border border-gray-800 px-3 py-2 text-left">Deskripsi</th>
              <th className="border border-gray-800 px-3 py-2 text-right w-36">Harga Satuan</th>
              <th className="border border-gray-800 px-3 py-2 text-right w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-gray-300 px-3 py-4 text-center text-gray-400">
                  Belum ada rincian barang
                </td>
              </tr>
            ) : (
              lineItems.map((it, i) => (
                <tr key={i}>
                  <td className="border border-gray-300 px-3 py-2 text-center align-top">{it.qty}</td>
                  <td className="border border-gray-300 px-3 py-2 align-top">
                    {it.label}
                    {it.meta && <div className="text-[10px] text-gray-400 font-mono mt-0.5">{it.meta}</div>}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right align-top font-mono">
                    Rp{it.unitPrice.toLocaleString("id-ID")}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right align-top font-mono font-semibold">
                    {it.isBonus ? "Bonus" : `Rp${it.amount.toLocaleString("id-ID")}`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Ringkasan — Subtotal / DP / Payment, rata kanan seperti di Excel */}
        <div className="flex justify-end">
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="pr-6 py-1 text-gray-500 text-right">Subtotal</td>
                <td className="py-1 text-right font-mono w-36">Rp{subtotal.toLocaleString("id-ID")}</td>
              </tr>
              {dpPaid > 0 && (
                <tr>
                  <td className="pr-6 py-1 text-gray-500 text-right">DP</td>
                  <td className="py-1 text-right font-mono">- Rp{dpPaid.toLocaleString("id-ID")}</td>
                </tr>
              )}
              <tr className="border-t-2 border-gray-800">
                <td className="pr-6 pt-2 font-bold text-gray-800 text-right">Payment</td>
                <td className="pt-2 text-right font-mono font-bold text-base">Rp{remaining.toLocaleString("id-ID")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {data.notes && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1.5">Catatan</p>
            <p className="text-sm text-gray-600">{data.notes}</p>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600 italic">Terima kasih atas kerja sama Anda!</p>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-card, #invoice-card * { visibility: visible; }
          .no-capture { display: none !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>
    </main>
  );
}