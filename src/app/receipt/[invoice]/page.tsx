import { supabase } from "@/services/supabase";
import Link from "next/link";
import ReceiptActions from "./ReceiptActions";

interface Props {
  params: Promise<{ invoice: string }>;
}

export default async function Page(props: Props) {
  const params = await props.params;

  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("invoice_number", params.invoice)
    .single();

  const whatsappMessage = encodeURIComponent(
    `Halo ${data?.customer_name} 👋\n\n` +
    `✅ Pembayaran laptop Anda berhasil!\n\n` +
    `📋 INVOICE: ${data?.invoice_number}\n\n` +
    `💻 Laptop: ${data?.laptop_name}\n` +
    `🔢 SN: ${data?.serial_number || "-"}\n` +
    `💰 Total: Rp${data?.amount?.toLocaleString("id-ID")}\n` +
    `🏷️ Status: LUNAS\n\n` +
    `Terima kasih sudah berbelanja di Solit 03 🙏\n` +
    `Sawangan, Depok`
  );

  const whatsappUrl = `https://wa.me/${data?.customer_phone?.replace(/^0/, "62")}?text=${whatsappMessage}`;

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
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mt-2"
          >
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      {/* Back Button */}
      <div className="max-w-md mx-auto mb-4">
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
        {/* Card Container */}
        <div id="receipt-card" className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* ── HEADER ── */}
          <div className="bg-[#0f172a] text-white relative overflow-hidden">
            {/* Decorative circles */}
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
                <p className="text-slate-400 text-xs mb-1">Nomor Invoice</p>
                <p className="font-mono font-bold text-lg tracking-widest">{data.invoice_number}</p>
                <p className="text-slate-400 text-xs mt-2">
                  {new Date(data.created_at).toLocaleDateString("id-ID", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* ── BODY ── */}
          <div className="p-6 space-y-5">

            {/* Total Amount — Hero */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
              <p className="text-emerald-600 text-sm font-medium">Total Pembayaran</p>
              <p className="text-3xl font-black text-emerald-700 mt-1">
                Rp{data.amount?.toLocaleString("id-ID")}
              </p>
              <p className="text-emerald-500 text-xs mt-1">{data.payment_method}</p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-dashed bg-gray-200" style={{ backgroundImage: "repeating-linear-gradient(to right, #e5e7eb 0, #e5e7eb 6px, transparent 6px, transparent 12px)" }} />
              <div className="text-gray-300 text-xs">✦</div>
              <div className="flex-1 h-px bg-gray-200" style={{ backgroundImage: "repeating-linear-gradient(to right, #e5e7eb 0, #e5e7eb 6px, transparent 6px, transparent 12px)" }} />
            </div>

            {/* Customer Info */}
            <Section title="Data Pembeli" icon="👤">
              <InfoRow label="Nama" value={data.customer_name} bold />
              <InfoRow label="WhatsApp" value={data.customer_phone} />
              {data.company_name && <InfoRow label="Perusahaan" value={data.company_name} />}
            </Section>

            <Separator />

            {/* Laptop Detail */}
            <Section title="Detail Laptop" icon="💻">
              <InfoRow label="Laptop" value={data.laptop_name} bold />
              {data.serial_number && (
                <InfoRow label="Serial Number" value={data.serial_number} mono />
              )}
              {data.software_request && (
                <InfoRow label="Software" value={data.software_request} />
              )}
            </Section>

            <Separator />

            {/* Pickup */}
            <Section title="Info Pengambilan" icon="📦">
              <InfoRow label="Metode" value={data.pickup_method === "DATANG" ? "Datang ke Toko" : "Diantar"} />
              {pickupDate && <InfoRow label="Tanggal" value={pickupDate} />}
              {data.pickup_time && <InfoRow label="Jam" value={data.pickup_time} />}
              {data.pickup_location && <InfoRow label="Alamat" value={data.pickup_location} />}
            </Section>

            {data.notes && (
              <>
                <Separator />
                <Section title="Catatan" icon="📝">
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{data.notes}</p>
                </Section>
              </>
            )}
          </div>

          <div className="px-6 pb-6 space-y-3">
            <ReceiptActions
              customerPhone={data.customer_phone || ""}
              invoiceNumber={data.invoice_number}
            />
          </div>

          {/* Branding Footer */}
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 text-center">
            <p className="text-xs text-slate-400">
              Terima kasih telah berbelanja di <span className="font-semibold text-slate-600">Solit 03</span>
            </p>
            <p className="text-xs text-slate-300 mt-0.5">Sawangan, Depok · solit03.com</p>
          </div>
        </div>

        {/* Back link bawah */}
        <div className="text-center mt-5">
          <Link
            href="/payment/create"
            className="text-sm text-slate-400 hover:text-slate-600 transition"
          >
            + Buat Transaksi Baru
          </Link>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .no-print { display: none !important; }
          @page { margin: 0; size: 80mm auto; }
        }
      `}</style>
    </main>
  );
}

// ── Helper Components ──────────────────────────────────────────────────────

function Section({
  title, icon, children,
}: {
  title: string; icon: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function InfoRow({
  label, value, bold, mono,
}: {
  label: string; value: string; bold?: boolean; mono?: boolean;
}) {
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
      style={{
        backgroundImage: "repeating-linear-gradient(to right, #e5e7eb 0, #e5e7eb 6px, transparent 6px, transparent 12px)",
      }}
    />
  );
}