import { supabase } from "@/services/supabase";
import Link from "next/link";
import ReceiptActions from "./ReceiptActions";
import { User, Package, Shield, FileText } from "lucide-react";
import ItemsTable from "@/components/receipt/ItemsTable";
import { buildLineItemsFromTxItems, sumLineItems, sumSavings } from "@/lib/receiptItems";
interface Props {
  params: Promise<{ invoice: string }>;
}

export default async function Page(props: Props) {
  const params = await props.params;

  const [{ data }, { data: warranty }, { data: txItems }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("invoice_number", params.invoice)
      .single(),
    supabase
      .from("warranties")
      .select("warranty_start, warranty_end, warranty_duration, status, notes")
      .eq("invoice_number", params.invoice)
      .single(),
       supabase
      .from("transaction_items")
      .select("item_type, item_name, serial_number, quantity, deal_price, is_bonus, unit_id, accessory_id")
      .eq("invoice_number", params.invoice),
  ]);

  const rawTxItems = txItems ?? [];
  const laptopItems = rawTxItems.filter((it: any) => it.item_type !== "accessory");
  const accessoryItems = rawTxItems.filter((it: any) => it.item_type === "accessory");
  const itemKind: "laptop" | "accessory" | "mixed" =
    laptopItems.length > 0 && accessoryItems.length > 0
      ? "mixed"
      : accessoryItems.length > 0
        ? "accessory"
        : "laptop";

  // ── Ambil harga JUAL RESMI (official) per unit/aksesori — dipakai buat
  // bandingin sama deal_price supaya bisa munculin coretan + badge diskon.
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
  const itemsSubtotal = sumLineItems(lineItems) || Number(data?.amount ?? 0);
  const itemsSavings = sumSavings(lineItems);

  if (!data || data.status !== "PAID") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100 p-5">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">Menunggu Konfirmasi</h1>
          <p className="text-gray-500 text-sm">Pembayaran belum dikonfirmasi oleh admin.</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mt-2">
            ← Kembali ke Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const pickupDate = data.pickup_date
    ? new Date(data.pickup_date).toLocaleDateString("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    })
    : null;

  // ── Format garansi ────────────────────────────────────────────────────────
  const warrantyEndDate = warranty?.warranty_end
    ? new Date(warranty.warranty_end).toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
    })
    : null;

  const warrantyStartDate = warranty?.warranty_start
    ? new Date(warranty.warranty_start).toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
    })
    : null;

  // Hitung sisa hari garansi
  const warrantyDaysLeft = warranty?.warranty_end
    ? Math.ceil(
      (new Date(warranty.warranty_end).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0))
      / (1000 * 60 * 60 * 24)
    )
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      {/* Back Button */}
      <div className="max-w-md mx-auto mb-4 no-capture">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition bg-white/70 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/50 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Kembali ke Dashboard
        </Link>
      </div>

      <div className="max-w-md mx-auto">
        {/* ── RECEIPT CARD (yang di-screenshot) ── */}
        <div id="receipt-card" className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* HEADER */}
          <div className="bg-[#0f172a] text-white relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/5 rounded-full" />
            <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-white/5 rounded-full" />
            <div className="relative p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h1 className="text-2xl font-black tracking-tight">SOLIT 03</h1>
                  <p className="text-slate-400 text-xs mt-0.5">Sawangan, Depok</p>
                </div>
                <div className="bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-white rounded-full inline-block" />
                  LUNAS
                </div>
              </div>
              <div className="bg-white/10 rounded-2xl p-4">
                <p className="text-slate-400 text-xs mb-1">Nomor Nota</p>
                <p className="font-mono font-bold text-lg tracking-widest">{data.invoice_number}</p>
                <p className="text-slate-400 text-xs mt-2">
                  {new Date(data.paid_at || data.created_at).toLocaleString("id-ID", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                    hour12: false,
                    timeZone: "Asia/Jakarta",
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* BODY */}
          <div className="p-6 space-y-5">

            {/* Total */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
              <p className="text-emerald-600 text-sm font-medium">Total Pembayaran</p>
              <p className="text-3xl font-black text-emerald-700 mt-1">
                Rp{data.amount?.toLocaleString("id-ID")}
              </p>
              <p className="text-emerald-500 text-xs mt-1">{data.payment_method}</p>
            </div>

            <Separator />

            {/* Detail Pembelian — gaya struk Indomaret: keterangan kiri, nominal kanan */}
            <Section
              title={itemKind === "accessory" ? "Detail Aksesoris" : itemKind === "mixed" ? "Detail Pembelian" : "Detail Laptop"}
              icon={<Package className="w-4 h-4" />}
            >
              <ItemsTable items={lineItems} />
              <div className="flex justify-between items-center pt-2.5 mt-1 border-t border-dashed border-gray-200">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Subtotal</span>
                <span className="text-sm font-bold text-gray-800 font-mono">Rp{itemsSubtotal.toLocaleString("id-ID")}</span>
              </div>
              {itemsSavings > 0 && (
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Lebih Hemat</span>
                  <span className="text-sm font-bold text-emerald-600 font-mono">Rp{itemsSavings.toLocaleString("id-ID")}</span>
                </div>
              )}
            </Section>

            <Separator />

            {/* Customer */}
            <Section title="Data Pembeli" icon={<User className="w-4 h-4" />}>
              <InfoRow label="Nama" value={data.customer_name} bold />
              <InfoRow label="WhatsApp" value={data.customer_phone} />
              {data.company_name && <InfoRow label="Perusahaan" value={data.company_name} />}
              <InfoRow
                label="Tipe"
                value={
                  data.customer_type === "RESELLER" ? "Reseller"
                    : data.customer_type === "MITRA" ? "Mitra Bisnis"
                      : "Umum"
                }
              />
            </Section>

            <Separator />

            {/* Pickup */}
            <Section title="Info Pengambilan" icon={<Package className="w-4 h-4" />}>
              <InfoRow label="Metode" value={data.pickup_method === "DATANG" ? "Datang ke Toko" : "Diantar"} />
              {pickupDate && <InfoRow label="Tanggal" value={pickupDate} />}
              {data.pickup_time && <InfoRow label="Jam" value={data.pickup_time} />}
              {data.pickup_location && <InfoRow label="Alamat" value={data.pickup_location} />}
            </Section>

            {/* ── GARANSI SECTION ── */}
            {warranty && (
              <>
                <Separator />
                <Section title="Informasi Garansi" icon={<Shield className="w-4 h-4" />}>
                  <div className={`rounded-xl p-4 border ${warrantyDaysLeft !== null && warrantyDaysLeft > 7
                    ? "bg-emerald-50 border-emerald-200"
                    : warrantyDaysLeft !== null && warrantyDaysLeft > 0
                      ? "bg-amber-50 border-amber-200"
                      : "bg-red-50 border-red-200"
                    }`}>
                    {/* Status badge */}
                    <div className="flex items-center justify-between mb-3">

                      <span className="text-xs text-gray-500">
                        {warranty.warranty_duration} hari
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Mulai</span>
                        <span className="font-medium text-gray-700">{warrantyStartDate}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Berakhir</span>
                        <span className={`font-bold ${warrantyDaysLeft !== null && warrantyDaysLeft > 7
                          ? "text-emerald-700"
                          : warrantyDaysLeft !== null && warrantyDaysLeft > 0
                            ? "text-amber-700"
                            : "text-red-700"
                          }`}>
                          {warrantyEndDate}
                        </span>
                      </div>
                    </div>

                    {warranty.notes && (
                      <p className="text-xs text-gray-600 mt-2.5 pt-2.5 border-t border-gray-200">
                        {warranty.notes}
                      </p>
                    )}
                  </div>

                  {/* Link cek garansi */}
                  <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-blue-700">Cek Garansi Online</p>
                      <p className="tesxt-[10px] text-blue-500 mt-0.5">solit03.com/cek-garansi</p>
                    </div>
                    <div className="text-xs font-mono text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">
                      SN: {data.serial_number || "—"}
                    </div>
                  </div>

                  {/* Ketentuan Garansi */}
                  <div className="mt-2.5 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
                      📋 Ketentuan Garansi
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed text-slate-500">
                      <li>Garansi hanya berlaku untuk kerusakan yang <strong>BUKAN akibat human error</strong>.</li>
                      <li>Kerusakan LCD seperti pecah, kena air, terbakar, bergaris, berkedip, gelap/redup, blank putih, dead pixel, berbayang/shadow, warna pudar/tidak akurat, serta bercak hitam/putih <strong>TIDAK termasuk garansi</strong>.</li>
                      <li>Wajib membawa nota pembelian ini saat melakukan klaim garansi.</li>
                    </ol>
                    <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5 mt-2">
                      ⚠️ <strong>Note:</strong> Barang yang sudah dibeli tidak bisa dikembalikan.
                    </p>
                  </div>
                </Section>
              </>
            )}

            {data.notes && (
              <>
                <Separator />
                <Section title="Catatan" icon={<FileText className="w-4 h-4" />}>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{data.notes}</p>
                </Section>
              </>
            )}
          </div>

          {/* Branding Footer */}
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 text-center">
            <p className="text-xs text-slate-400">
              Terima kasih telah berbelanja di{" "}
              <span className="font-semibold text-slate-600">Solit 03</span>
            </p>
            <p className="text-xs text-slate-300 mt-0.5">Sawangan, Depok · solit03.com</p>
          </div>

          {/* Tombol aksi — tidak ikut screenshot */}
          <div className="px-6 pb-6 pt-3 space-y-3 no-capture">
            <ReceiptActions
              customerPhone={data.customer_phone || ""}
              invoiceNumber={data.invoice_number}
              customerName={data.customer_name || ""}
              laptopName={data.laptop_name || ""}
              serialNumber={itemKind === "accessory" ? "" : (data.serial_number || "")}
              amount={data.amount || 0}
              paymentMethod={data.payment_method || ""}
              pickupMethod={data.pickup_method || ""}
              pickupDate={data.pickup_date || undefined}
              pickupTime={data.pickup_time || undefined}
              softwareRequest={data.software_request || undefined}
              warrantyEnd={warranty?.warranty_end || undefined}
              warrantyDaysLeft={warrantyDaysLeft ?? undefined}
              customerType={data.customer_type || "UMUM"}
              itemKind={itemKind}
              items={lineItems}
            />
          </div>
        </div>

        {/* Back link bawah */}
        <div className="text-center mt-5 no-capture">
          <Link href="/payment/create" className="text-sm text-slate-400 hover:text-slate-600 transition">
            + Buat Transaksi Baru
          </Link>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-card, #receipt-card * { visibility: visible; }
          .no-capture, .no-print { display: none !important; }
          @page { margin: 0; size: 80mm auto; }
        }
        .no-capture { display: block; }
      `}</style>
    </main>
  );
}

// ── Helper Components ─────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-gray-400 text-sm flex-shrink-0">{label}</span>
      <span className={`text-sm text-right ${bold ? "font-semibold text-gray-800" : "text-gray-600"} ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Separator() {
  return (
    <div
      className="h-px"
      style={{ backgroundImage: "repeating-linear-gradient(to right, #e5e7eb 0, #e5e7eb 6px, transparent 6px, transparent 12px)" }}
    />
  );
}