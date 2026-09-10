import { supabase } from "@/services/supabase";
import Link from "next/link";
import ReceiptActions from "./ReceiptActions";
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      {/* Back Button */}
      <div className="max-w-md mx-auto mb-4 no-capture print:hidden">
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
        {/* ── RECEIPT CARD (thermal / gaya minimarket) — yang di-screenshot ──
            Wrapper punya drop-shadow yg ngikutin bentuk sobekan. */}
        <div id="receipt-card" style={{ filter: "drop-shadow(0 12px 28px rgba(15,23,42,0.18))" }}>
          {/* Kertas struk */}
          <div
            className="font-mono text-black"
            style={{ backgroundColor: "#faf9f6", padding: "22px 22px 14px" }}
          >
            {/* KOP: logo di atas, semua center */}
            <div className="text-center leading-tight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/solit03.jpeg"
                alt="SOLIT 03"
                className="object-contain mx-auto mb-1.5"
                style={{ width: "58px", height: "auto" }}
              />
              <p className="font-bold text-[15px] tracking-[0.15em]">SOLIT 03</p>
              <p className="text-[11px]">Jl. Raya Sawangan, Sawangan</p>
              <p className="text-[11px]">Depok · solit03.com</p>
            </div>

            <p className="text-center text-[12px] font-bold tracking-[0.35em] mt-2">*** LUNAS ***</p>

            <Dashed />

            {/* Meta transaksi */}
            <div className="text-[12px] space-y-0.5">
              <MetaRow label="No. Nota" value={data.invoice_number} />
              <MetaRow
                label="Tanggal"
                value={new Date(data.paid_at || data.created_at).toLocaleString("id-ID", {
                  day: "2-digit", month: "long", year: "numeric",
                  hour: "2-digit", minute: "2-digit", hour12: false,
                  timeZone: "Asia/Jakarta",
                })}
              />
            </div>

            <Dashed />

            {/* Detail pembelian */}
            <ThermalHeading>
              {itemKind === "accessory" ? "DETAIL AKSESORIS" : itemKind === "mixed" ? "DETAIL PEMBELIAN" : "DETAIL LAPTOP"}
            </ThermalHeading>
            <div className="space-y-2 text-[12px]">
              {lineItems.map((it, i) => (
                <div key={i}>
                  <p className="uppercase break-words leading-snug font-semibold">{it.label}</p>
                  {it.meta && <p className="text-[11px] leading-tight text-black/70">{it.meta}</p>}
                  {it.officialUnitPrice ? (
                    <p className="text-[11px] leading-tight">
                      Normal <span className="line-through">{num(it.officialUnitPrice)}</span>
                      {it.hasDiscount ? ` (-${it.discountPercent}%)` : ""}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-[2rem_1fr_1fr] gap-1">
                    <span>{it.qty}x</span>
                    <span className="text-right">{num(it.unitPrice)}</span>
                    <span className="text-right font-semibold">{it.isBonus ? "BONUS" : num(it.amount)}</span>
                  </div>
                </div>
              ))}
            </div>

            <Dashed />

            {/* Ringkasan (rata kanan gaya minimarket) */}
            <div className="ml-auto text-[12px] space-y-0.5" style={{ width: "72%" }}>
              <SumRow label="Subtotal" value={`Rp${num(itemsSubtotal)}`} />
              {itemsSavings > 0 && <SumRow label="Diskon" value={`(Rp${num(itemsSavings)})`} />}
              <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
              <SumRow label="TOTAL" value={`Rp${num(data.amount ?? itemsSubtotal)}`} bold />
              {data.payment_method && <SumRow label="BAYAR" value={data.payment_method} />}
            </div>

            {itemsSavings > 0 && (
              <p className="text-center mt-2 text-[12px] font-bold">ANDA HEMAT : Rp{num(itemsSavings)}</p>
            )}

            <Dashed />

            {/* Data pembeli */}
            <ThermalHeading>DATA PEMBELI</ThermalHeading>
            <div className="text-[12px] space-y-0.5">
              <MetaRow label="Nama" value={data.customer_name || "-"} />
              <MetaRow label="WhatsApp" value={data.customer_phone || "-"} />
              {data.company_name && <MetaRow label="Perusahaan" value={data.company_name} />}
              <MetaRow
                label="Tipe"
                value={
                  data.customer_type === "RESELLER" ? "Reseller"
                    : data.customer_type === "MITRA" ? "Mitra Bisnis"
                      : "Umum"
                }
              />
            </div>

            <Dashed />

            {/* Info pengambilan */}
            <ThermalHeading>INFO PENGAMBILAN</ThermalHeading>
            <div className="text-[12px] space-y-0.5">
              <MetaRow label="Metode" value={data.pickup_method === "DATANG" ? "Datang ke Toko" : "Diantar"} />
              {pickupDate && <MetaRow label="Tanggal" value={pickupDate} />}
              {data.pickup_time && <MetaRow label="Jam" value={data.pickup_time} />}
              {data.pickup_location && <MetaRow label="Alamat" value={data.pickup_location} />}
            </div>

            {/* Garansi */}
            {warranty && (
              <>
                <Dashed />
                <ThermalHeading>INFORMASI GARANSI</ThermalHeading>
                <div className="text-[12px] space-y-0.5">
                  <MetaRow label="Durasi" value={`${warranty.warranty_duration} hari`} />
                  {warrantyStartDate && <MetaRow label="Mulai" value={warrantyStartDate} />}
                  {warrantyEndDate && <MetaRow label="Berakhir" value={warrantyEndDate} />}
                  <MetaRow label="Cek Garansi" value="solit03.com/cek-garansi" />
                  <MetaRow label="SN" value={data.serial_number || "-"} />
                </div>
                {warranty.notes && <p className="text-[11px] mt-1.5 leading-relaxed">{warranty.notes}</p>}

                <div className="text-[11px] mt-2 leading-relaxed">
                  <p className="font-bold">KETENTUAN GARANSI:</p>
                  <ol className="list-decimal list-inside space-y-1 mt-0.5">
                    <li>Garansi hanya berlaku untuk kerusakan yang BUKAN akibat human error.</li>
                    <li>Kerusakan LCD (pecah, kena air, terbakar, bergaris, berkedip, gelap/redup, blank putih, dead pixel, berbayang/shadow, warna pudar/tidak akurat, bercak hitam/putih) TIDAK termasuk garansi.</li>
                    <li>Wajib membawa nota ini saat klaim garansi.</li>
                  </ol>
                  <p className="font-bold mt-1.5">!! Barang yang sudah dibeli tidak bisa dikembalikan.</p>
                </div>
              </>
            )}

            {/* Catatan */}
            {data.notes && (
              <>
                <Dashed />
                <ThermalHeading>CATATAN</ThermalHeading>
                <p className="text-[12px] leading-relaxed">{data.notes}</p>
              </>
            )}

            {/* Footer + barcode */}
            <div className="mt-3 text-center text-[11px] leading-tight">
              <DoubleLine />
              <p className="font-bold">TERIMA KASIH TELAH BERBELANJA</p>
              <p>SOLIT 03 — LAPTOP BERKUALITAS</p>
              <Barcode value={data.invoice_number} />
              <DoubleLine />
              <p>WWW.SOLIT03.COM</p>
            </div>
          </div>

          {/* Sobekan gerigi bawah — kalau di PNG kelihatan aneh, hapus div ini aja */}
          <div aria-hidden style={tornEdge} />
        </div>

        {/* Tombol aksi — di luar receipt-card, dijamin tidak ikut PNG */}
        <div className="mt-4 space-y-3 no-capture">
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
            warrantyDaysLeft={undefined}
            customerType={data.customer_type || "UMUM"}
            itemKind={itemKind}
            items={lineItems}
          />
        </div>

        {/* Back link bawah */}
        <div className="text-center mt-5 no-capture">
          <Link href="/payment/create" className="text-sm text-slate-400 hover:text-slate-600 transition">
            + Buat Transaksi Baru
          </Link>
        </div>
      </div>
    </main>
  );
}

// ── Helper Components (thermal) ───────────────────────────────────────────────
// Angka gaya struk: tanpa "Rp", format ribuan id-ID (mis. 3.100.000)
const num = (v: number) => (v || 0).toLocaleString("id-ID");

// Gerigi sobekan bawah (pakai gradient, aman buat html2canvas — bukan mask)
const tornEdge: React.CSSProperties = {
  height: 12,
  backgroundImage:
    "linear-gradient(45deg, #faf9f6 50%, transparent 50%), linear-gradient(-45deg, #faf9f6 50%, transparent 50%)",
  backgroundSize: "14px 12px",
  backgroundRepeat: "repeat-x",
  backgroundPosition: "top left",
};

function Dashed() {
  return <div className="my-2.5" style={{ borderTop: "1px dashed #000", height: 0 }} />;
}

function DoubleLine() {
  return <div className="my-1.5" style={{ borderTop: "3px double #000", height: 0 }} />;
}

function ThermalHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-bold tracking-wider mb-1.5">{children}</p>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold text-[15px]" : ""}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

// Barcode dekoratif — bar hitam-putih via gradient + nomor nota di bawahnya
function Barcode({ value }: { value: string }) {
  return (
    <div className="mx-auto mt-2" style={{ width: "68%" }}>
      <div
        aria-hidden
        style={{
          height: 40,
          backgroundImage:
            "repeating-linear-gradient(90deg, #000 0 1px, #fff 1px 3px, #000 3px 5px, #fff 5px 6px, #000 6px 9px, #fff 9px 11px)",
        }}
      />
      <p className="text-[11px] tracking-[0.3em] mt-1">{value}</p>
    </div>
  );
}